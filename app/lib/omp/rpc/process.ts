/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Process + protocol layer for `omp --mode rpc-ui` (NDJSON over stdio).
 * Protocol v1: commands `{id, type, ...}` on stdin; `{type:"response", id, ...}`
 * plus interleaved event frames on stdout. omp announces readiness with a
 * `{type:"ready"}` frame before accepting commands. When readiness advertises
 * protocol v2, callers negotiate it before sending normal commands; oversized
 * logical frames are then carried as bounded `rpc_chunk` sequences.
 *
 * Faithful port of omp-web/lib/omp/rpc-process.ts.
 */

import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';
import { resolveOmpBin } from '@/lib/omp/core/cli';
import { encodeRpcFrames, RpcFrameDecoder, type RpcFrameRecord, type RpcProtocolVersion } from '@/lib/omp/rpc/frame';
import {
  RpcCommandError,
  RpcCommandTimeoutError,
  sanitizeProjectCommandEnvironment,
  STDERR_TAIL_LIMIT,
  type PendingCommand,
  type RpcFrame,
  type RpcProcessOptions,
  type RpcResponseFrame,
} from '@/lib/omp/rpc/process-helpers';

export { RpcCommandError, RpcCommandTimeoutError } from '@/lib/omp/rpc/process-helpers';
export type { RpcFrame, RpcProcessOptions, RpcResponseFrame } from '@/lib/omp/rpc/process-helpers';

export class RpcProcess {
  readonly cwd: string;
  private child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingCommand>();
  private readonly frameListeners = new Set<(frame: RpcFrame) => void>();
  private readyPromise: Promise<RpcFrame>;
  private nextId = 1;
  private stderrTail = '';
  private exited = false;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  private protocolVersion: RpcProtocolVersion = 1;
  private nextChunkId = 1;
  private readonly spawnProcess: typeof spawn;
  // Serializes physical stdin writes: a v2 logical frame can span multiple
  // `rpc_chunk` records (>1 MiB payloads), and two frames written concurrently
  // would interleave their chunk sequences on stdin, which RpcFrameDecoder
  // rejects. Each logical frame is enqueued whole.
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: RpcProcessOptions) {
    const resolveBin = options.dependencies?.resolveOmpBin ?? resolveOmpBin;
    this.spawnProcess = options.dependencies?.spawn ?? spawn;
    const bin = resolveBin();
    if (!bin) {
      throw new Error('omp binary not found. Install oh-my-pi or set OMP_WEB_OMP_BIN.');
    }
    this.cwd = options.cwd;
    if (options.onFrame) this.frameListeners.add(options.onFrame);

    const args = ['--mode', 'rpc-ui', '--cwd', options.cwd, ...(options.extraArgs ?? [])];
    // Strip named profiles (OMP_PROFILE/PI_PROFILE) so the child resolves the
    // same default agent dir. An explicit options.env entry still wins.
    const childEnv = sanitizeProjectCommandEnvironment({ ...process.env, ...options.env });
    if (options.env?.OMP_PROFILE === undefined) delete childEnv.OMP_PROFILE;
    if (options.env?.PI_PROFILE === undefined) delete childEnv.PI_PROFILE;
    this.child = this.spawnProcess(bin, args, {
      cwd: options.cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // On POSIX, omp launches grandchildren (LSP servers, extension subprocesses). Run the
      // child in its own process group so dispose() can SIGTERM/SIGKILL the whole
      // tree — otherwise a crashed omp would orphan its LSP children as zombies.
      // Windows uses taskkill /t instead, so detaching would only create a console.
      detached: process.platform !== 'win32',
    });

    // A write queued when the child dies fails both the write callback and an
    // 'error' event on the pipe. Without a listener that event becomes an
    // uncaughtException.
    this.child.stdin.on('error', () => {});
    this.child.stdout.on('error', () => {});

    let resolveReady: (frame: RpcFrame) => void;
    let rejectReady: (error: Error) => void;
    this.readyPromise = new Promise<RpcFrame>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // waitReady() is optional for callers; avoid unhandled-rejection noise when
    // the process dies before anyone awaited readiness.
    this.readyPromise.catch(() => {});

    const decoder = new RpcFrameDecoder();
    const rl = createInterface({ input: this.child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // omp guards stdout in RPC mode, but never let a stray line kill the reader.
        return;
      }
      let frame: RpcFrameRecord;
      try {
        if (parsed && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'rpc_chunk' && this.protocolVersion !== 2) {
          throw new Error('RPC chunk received before protocol negotiation');
        }
        const decoded = decoder.push(parsed);
        if (!decoded) return;
        frame = decoded;
      } catch (error) {
        this.stderrTail = (this.stderrTail + `\nRPC protocol error: ${error instanceof Error ? error.message : String(error)}`).slice(-STDERR_TAIL_LIMIT);
        void this.dispose(0);
        return;
      }
      if (frame.type === 'ready') {
        resolveReady(frame);
        return;
      }
      if (frame.type === 'response') {
        this.handleResponse(frame as unknown as RpcResponseFrame);
        return;
      }
      for (const listener of this.frameListeners) {
        try {
          listener(frame);
        } catch {
          // Listener bugs must not break the protocol reader.
        }
      }
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_LIMIT);
    });

    const finalize = (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.exited) return;
      this.exited = true;
      this.exitInfo = { code, signal };
      const exitError = new Error(
        `omp exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})${this.stderrTail ? `: ${this.stderrTail.slice(-500)}` : ''}`,
      );
      rejectReady(exitError);
      for (const [, entry] of this.pending) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.reject(exitError);
      }
      this.pending.clear();
      options.onExit?.({ code, signal, stderrTail: this.stderrTail });
    };
    this.child.on('exit', finalize);
    this.child.on('error', (error) => {
      this.stderrTail = (this.stderrTail + `\nspawn error: ${error.message}`).slice(-STDERR_TAIL_LIMIT);
      finalize(null, null);
    });
  }

  get isAlive(): boolean {
    return !this.exited;
  }

  get exitDetails(): { code: number | null; signal: NodeJS.Signals | null; stderrTail: string } | null {
    return this.exitInfo ? { ...this.exitInfo, stderrTail: this.stderrTail } : null;
  }

  /** Resolves with the `ready` frame; rejects if the process dies first or the
   * timeout elapses. omp startup can take a few seconds (extensions, LSP). */
  waitReady(timeoutMs = 60_000): Promise<RpcFrame> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`omp RPC ready timeout after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
      this.readyPromise.finally(() => clearTimeout(timer)).catch(() => {});
    });
    return Promise.race([this.readyPromise, timeout]);
  }

  /** Enables bounded protocol-v2 framing when the ready frame advertises it. */
  async negotiateProtocol(ready: RpcFrame): Promise<RpcProtocolVersion> {
    const supported = Array.isArray(ready.supportedProtocolVersions) ? ready.supportedProtocolVersions : [];
    if (!supported.includes(2)) return this.protocolVersion;
    const response = await this.sendCommand<{ protocolVersion?: unknown }>({ type: 'negotiate_protocol', protocolVersion: 2 });
    if (response?.protocolVersion !== 2) throw new Error('OMP rejected RPC protocol v2 negotiation');
    this.protocolVersion = 2;
    return this.protocolVersion;
  }

  onFrame(listener: (frame: RpcFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Send a command and await its response `data`. A failed response rejects
   * with RpcCommandError. No timeout by default — some commands (login,
   * long prompts via bash) legitimately take minutes, and the session wrapper
   * reclaims wedged children via idle-kill and dispose(). Callers that want a
   * cap pass `timeoutMs` (>0); when set, the timer is unref'd so it never
   * keeps the event loop alive on its own. */
  sendCommand<T = unknown>(command: { type: string; [key: string]: unknown }, timeoutMs?: number): Promise<T> {
    if (this.exited) {
      return Promise.reject(new Error('omp RPC process has exited'));
    }
    const id = `w${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingCommand = {
        command: command.type,
        resolve: resolve as (data: unknown) => void,
        reject,
      };
      if (timeoutMs && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          // Only reject if this exact entry is still pending — a reused id or a
          // response that landed between the timer firing and this callback must
          // not spuriously reject a different command.
          if (this.pending.get(id) === entry) {
            this.pending.delete(id);
            reject(new RpcCommandTimeoutError(command.type, timeoutMs));
          }
        }, timeoutMs);
        // A pending command timer must never keep the event loop alive on its own
        // (it would block graceful shutdown when omp has stopped answering).
        entry.timer.unref?.();
      }
      this.pending.set(id, entry);
      this.writeFrame({ ...command, id }, (error) => {
        if (error) {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            if (pending.timer) clearTimeout(pending.timer);
            reject(error);
          }
        }
      });
    });
  }

  /** Fire-and-forget frame write (extension_ui_response, host_tool_result). */
  sendFrame(frame: { type: string; [key: string]: unknown }): void {
    if (this.exited) return;
    this.writeFrame(frame, () => {});
  }

  private writeFrame(frame: RpcFrame, callback: (error?: Error | null) => void): void {
    let lines: string[];
    try {
      lines = encodeRpcFrames(frame, this.protocolVersion, `web-${this.nextChunkId++}`);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    // Enqueue the entire encoded logical frame; the next frame's physical
    // records only start after this frame's last write callback completes.
    this.writeQueue = this.writeQueue.then(
      () => new Promise<void>((resolve) => {
        if (this.exited || this.child.stdin.destroyed) {
          callback(new Error('RPC process is not running'));
          resolve();
          return;
        }
        let index = 0;
        const writeNext = (error?: Error | null) => {
          if (error || index === lines.length) {
            callback(error ?? null);
            resolve();
            return;
          }
          this.child.stdin.write(lines[index++], writeNext);
        };
        writeNext();
      }),
    );
  }

  private handleResponse(response: RpcResponseFrame): void {
    const id = response.id;
    const entry = id ? this.pending.get(id) : undefined;
    if (!entry || !id) {
      // Unsolicited response (or a command we already timed out) — surface to
      // frame listeners so nothing is silently dropped.
      for (const listener of this.frameListeners) {
        try {
          listener(response as unknown as RpcFrame);
        } catch {}
      }
      return;
    }
    this.pending.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (response.success) {
      entry.resolve(response.data);
    } else {
      entry.reject(new RpcCommandError(response.command, response.error ?? 'RPC command failed', response.code));
    }
  }

  /** Graceful shutdown: close stdin (omp exits on EOF), escalate to SIGTERM
   * then SIGKILL on the whole process group. Resolves once the process has
   * exited. Safe to call during server teardown — escalation timers are
   * unref'd so they never keep the event loop alive on their own. */
  async dispose(gracePeriodMs = 5_000): Promise<void> {
    if (this.exited) return;
    const exited = new Promise<void>((resolve) => {
      if (this.exited) return resolve();
      this.child.once('exit', () => resolve());
    });
    try {
      this.child.stdin.end();
    } catch {}
    // POSIX can signal the detached process group directly. Windows has no
    // portable negative-pid equivalent, so use taskkill's tree operation to
    // avoid orphaning extension and LSP grandchildren.
    const killTree = (force: boolean, signal: NodeJS.Signals) => {
      const pid = this.child.pid;
      if (!pid) return;
      if (process.platform === 'win32') {
        const args = ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])];
        const reaper = this.spawnProcess('taskkill', args, { windowsHide: true, stdio: 'ignore' });
        reaper.once('error', () => {
          try { this.child.kill(signal); } catch {}
        });
        return;
      }
      try {
        process.kill(-pid, signal);
      } catch {
        try { this.child.kill(signal); } catch {}
      }
    };
    const timer = setTimeout(() => {
      if (!this.exited) killTree(false, 'SIGTERM');
    }, gracePeriodMs);
    const killTimer = setTimeout(() => {
      if (!this.exited) killTree(true, 'SIGKILL');
    }, gracePeriodMs * 2);
    timer.unref?.();
    killTimer.unref?.();
    await exited;
    clearTimeout(timer);
    clearTimeout(killTimer);
  }
}
