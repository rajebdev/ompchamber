/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared short-lived `omp` utility process for global registry/auth queries
 * (get_available_models, get_login_providers, get_state). These commands do
 * not belong to any user session, so they run against a single lazily-started
 * RPC process that is killed after ~300s of inactivity. Access is serialized:
 * the omp RPC loop handles one command at a time anyway, and serialization
 * lets lazy start/idle-kill stay race-free.
 *
 * Real user sessions must use lib/rpc-manager.ts instead — this process runs
 * with --no-session and its agent state is throwaway.
 *
 * Faithful port of omp-web/lib/omp/rpc-utility.ts.
 */

import { homedir } from 'os';
import { RpcProcess } from '@/server/lib/omp/rpc/process';

// Extensions stay ENABLED: they can register models and login providers, and
// omitting them made the web UI's model/provider lists disagree with the CLI's.
const UTILITY_EXTRA_ARGS = ['--no-session', '--no-skills', '--no-lsp'];
const READY_TIMEOUT_MS = 60_000;
// Longer than the 60s models-cache TTL on purpose: with idle-kill == TTL every
// pause past a minute paid a cold multi-second respawn on top of the stale
// cache. Cost of the longer window is one idle omp process.
const IDLE_KILL_MS = 300_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

/** Minimal mirror of omp's Model — only the fields the models/auth routes
 * read. Everything else passes through opaque. */
export interface OmpModel {
  id: string;
  name: string;
  provider: string;
  api?: string;
  reasoning?: boolean;
  thinking?: {
    mode?: string;
    efforts?: string[];
    defaultLevel?: string;
    effortMap?: Record<string, string>;
  };
  input?: string[];
  contextWindow?: number | null;
  maxTokens?: number | null;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

/** Entry of the get_login_providers response (modes/rpc/rpc-types.ts). */
export interface OmpLoginProvider {
  id: string;
  name: string;
  available: boolean;
  authenticated: boolean;
}

interface UtilityRpcState {
  proc: RpcProcess | null;
  idleTimer: NodeJS.Timeout | null;
  queue: Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompUtilityRpcState: UtilityRpcState | undefined;
}

function getState(): UtilityRpcState {
  if (!globalThis.__ompUtilityRpcState) {
    globalThis.__ompUtilityRpcState = { proc: null, idleTimer: null, queue: Promise.resolve() };
    // Dispose the shared utility omp process on server shutdown so it does not
    // outlive the server. Idempotent and safe to call any time.
    const cleanup = () => disposeUtilityRpc();
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }
  return globalThis.__ompUtilityRpcState;
}

/**
 * Tear down the shared utility omp process immediately (skip the idle timer).
 * Safe to call any time — it just clears any pending idle kill and disposes
 * the live child.
 */
export function disposeUtilityRpc(): void {
  const state = globalThis.__ompUtilityRpcState;
  if (!state) return;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  const proc = state.proc;
  state.proc = null;
  if (proc) void proc.dispose();
}

function scheduleIdleKill(state: UtilityRpcState): void {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    const proc = state.proc;
    state.proc = null;
    if (proc) void proc.dispose();
  }, IDLE_KILL_MS);
  state.idleTimer.unref?.();
}

async function startProcess(state: UtilityRpcState): Promise<RpcProcess> {
  const proc = new RpcProcess({
    cwd: homedir(),
    extraArgs: UTILITY_EXTRA_ARGS,
    onExit: () => {
      if (state.proc === proc) state.proc = null;
    },
  });
  try {
    const ready = await proc.waitReady(READY_TIMEOUT_MS);
    await proc.negotiateProtocol(ready);
  } catch (error) {
    void proc.dispose();
    throw error;
  }
  return proc;
}

/** Run one RPC command on the shared utility process (lazy start, serialized,
 * idle-killed). Rejections from earlier commands never poison the queue. */
export function runUtilityCommand<T = unknown>(
  command: { type: string; [key: string]: unknown },
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<T> {
  const state = getState();
  const run = state.queue.then(async () => {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    try {
      if (!state.proc || !state.proc.isAlive) {
        state.proc = await startProcess(state);
      }
      return await state.proc.sendCommand<T>(command, timeoutMs);
    } finally {
      scheduleIdleKill(state);
    }
  });
  state.queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Run one RPC command on a dedicated throwaway process. Used where the shared
 * process must not be reused — e.g. a connectivity test that points
 * PI_CODING_AGENT_DIR at a temp dir via `env`.
 *
 * `signal` (optional) aborts the whole lifecycle: a not-yet-ready child is
 * disposed immediately and a pending command is rejected. Callers with a
 * Request should pass `request.signal` so a disconnected client does not keep
 * a 60s registry spawn running. */
export async function runIsolatedUtilityCommand<T = unknown>(
  command: { type: string; [key: string]: unknown },
  options: { env?: Record<string, string>; cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const proc = new RpcProcess({
    cwd: options.cwd ?? homedir(),
    extraArgs: UTILITY_EXTRA_ARGS,
    env: options.env,
  });
  const signal = options.signal;
  const onAbort = () => { void proc.dispose(); };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const ready = await proc.waitReady(READY_TIMEOUT_MS);
    await proc.negotiateProtocol(ready);
    return await proc.sendCommand<T>(command, options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }
    throw error;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    // Await the child's exit (not fire-and-forget): callers like a config test
    // remove their throwaway temp dir right after this resolves, and on
    // Windows a still-exiting child holding handles on that dir makes rmSync
    // fail (EBUSY, only suppressed by force: true).
    await proc.dispose();
  }
}
