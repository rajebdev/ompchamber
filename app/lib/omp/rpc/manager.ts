/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session RPC manager for OMPChamber — the analog of omp-web's
 * lib/rpc-manager.ts. Wraps one spawned `omp --mode rpc-ui` process per
 * session with the command surface the chamber chat needs: prompt, abort,
 * abort_and_prompt, set_model, set_thinking_level, get_state, and the
 * passthrough set. Event frames (agent_start/agent_end/message_update/...)
 * are forwarded to SSE subscribers via onEvent.
 *
 * Scoped down from omp-web: host tools, URI schemes, extension widgets, MCP
 * list, and branch/fork are omitted (the chamber does not surface them yet).
 */

import { RpcProcess, type RpcFrame } from '@/lib/omp/rpc/process';
import { PendingUiDialogs } from '@/lib/omp/rpc/pending-ui-dialogs';
import { clearSessionFileCaches } from '@/lib/omp/session/files';
import { notifyRunningChange } from '@/lib/omp/rpc/session-registry';
import { dispatchSessionCommand } from '@/lib/omp/rpc/session-commands';
import {
  GET_STATE_TIMEOUT_MS,
  IDLE_DESTROY_MS,
  NON_TERMINAL_CONTINUATION_GRACE_MS,
  READY_TIMEOUT_MS,
  type AgentEvent,
  type EventListener,
  type RpcSessionState,
} from '@/lib/omp/rpc/constants';

export type {
  AgentEvent,
  EventListener,
  RpcSessionState,
  WebSessionState,
} from '@/lib/omp/rpc/constants';
export { WebRpcError, resolveSpawnCwd } from '@/lib/omp/rpc/constants';

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  promptRunning = false;
  promptDispatchPendingCount = 0;
  awaitingAgentStart = false;
  awaitingAgentStartDeadline = 0;
  continuationGraceUntil = 0;
  bashRunning = false;
  streaming = false;
  compacting = false;
  fastModeEnabled = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private unsubscribeFrames: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;
  restarting = false;
  private _alive = true;
  destroyPromise: Promise<void> | null = null;
  private _sessionId = '';
  private _sessionFile = '';
  // Ask/approval dialogs omp is currently blocked on. omp never re-delivers an
  // `extension_ui_request`, so a client that reloads mid-dialog can only learn
  // the id it must answer from here.
  private readonly pendingUiDialogs = new PendingUiDialogs();
  proc: RpcProcess;
  readonly cwd: string;
  private readonly recordedCwd: string | null;

  constructor(proc: RpcProcess, cwd: string, recordedCwd?: string | null) {
    this.proc = proc;
    this.cwd = cwd;
    this.recordedCwd = recordedCwd ?? null;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get sessionFile(): string {
    return this._sessionFile;
  }

  isAlive(): boolean {
    return this._alive && this.proc.isAlive;
  }

  /** OS pid of this session's omp process; the key into the shared browser's
   * per-process target registry. */
  get pid(): number | undefined {
    return this.proc.pid;
  }

  isRunning(): boolean {
    return this.isAlive() && (this.promptRunning || this.streaming || this.compacting || this.bashRunning);
  }

  start(): void {
    this.unsubscribeFrames = this.proc.onFrame((frame) => this.handleFrame(frame));
    this.resetIdleTimer();
    notifyRunningChange();
  }

  /** Resolves once the child announced readiness and identity is known. */
  waitUntilReady(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    const ready = await this.proc.waitReady(READY_TIMEOUT_MS);
    await this.proc.negotiateProtocol(ready);
    // Subscribe to subagent lifecycle/progress/event frames so the UI can show
    // a live subagent roster. Older omp builds may not know the command —
    // degrade silently.
    await this.proc.sendCommand({ type: 'set_subagent_subscription', level: 'events' }).catch(() => {});
    const state = await this.getStateWithTimeout();
    this.applyIdentity(state);
    if (this.recordedCwd && this.recordedCwd !== this.cwd) {
      this.emit({
        type: 'notice',
        level: 'warning',
        message: `This session's working directory no longer exists; the agent is running in ${this.cwd}.`,
      });
    }
  }

  private applyIdentity(state: RpcSessionState): void {
    this._sessionId = state.sessionId;
    this._sessionFile = state.sessionFile ?? '';
    this.streaming = state.isStreaming;
    this.compacting = state.isCompacting;
    this.fastModeEnabled = state.fastModeEnabled ?? state.fastMode ?? this.fastModeEnabled;
  }

  handleProcessExit(stderrTail: string): void {
    if (!this._alive || this.restarting) return;
    const detail = stderrTail.trim().split('\n').pop() ?? '';
    this.emit({
      type: 'notice',
      level: 'error',
      message: `The omp process for this session exited unexpectedly${detail ? `: ${detail}` : '.'}`,
    });
    if (this.streaming || this.promptRunning) this.emit({ type: 'agent_end', isTerminal: true, messages: [] });
    this.destroy();
  }

  private handleFrame(frame: RpcFrame): void {
    this.resetIdleTimer();
    const event = frame as AgentEvent;
    let refreshSessionList = false;

    switch (event.type) {
      case 'agent_start':
        this.promptRunning = true;
        this.streaming = true;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        this.continuationGraceUntil = 0;
        clearSessionFileCaches();
        refreshSessionList = true;
        break;
      case 'agent_end':
        if (event.isTerminal !== false) {
          this.streaming = false;
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.continuationGraceUntil = 0;
          clearSessionFileCaches();
        } else {
          this.continuationGraceUntil = Date.now() + NON_TERMINAL_CONTINUATION_GRACE_MS;
        }
        break;
      case 'prompt_result':
        this.promptRunning = false;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        break;
      case 'auto_compaction_start':
        this.compacting = true;
        break;
      case 'auto_compaction_end':
        this.compacting = false;
        clearSessionFileCaches();
        break;
      case 'session_info_update':
        clearSessionFileCaches();
        refreshSessionList = true;
        break;
      case 'extension_ui_request':
        this.pendingUiDialogs.track(event);
        break;
      case 'response': {
        if (event.success === false && event.command === 'prompt') {
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.emit({ type: 'prompt_error', errorMessage: (event.error as string) ?? 'Prompt failed' });
          notifyRunningChange();
          return;
        }
        break;
      }
    }

    this.emit(event);
    notifyRunningChange({ refreshSessionList });
  }

  emit(event: AgentEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // A throwing subscriber (SSE encode failure, UI handler bug) must not
        // starve the remaining subscribers.
      }
    }
  }

  private lastIdleReset = 0;
  resetIdleTimer(force = false): void {
    const now = Date.now();
    if (!force && this.idleTimer && now - this.lastIdleReset < 5000) {
      return;
    }
    this.lastIdleReset = now;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.isRunning()) {
        this.resetIdleTimer(true);
        return;
      }
      this.destroy();
    }, IDLE_DESTROY_MS);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  /** Dialogs omp is still blocked on, oldest first. A client reattaching to a
   *  live session replays these so the modal it lost on reload comes back. */
  getPendingUiDialogs(): RpcFrame[] {
    return this.pendingUiDialogs.list();
  }

  /** Forget a dialog once its response is on the wire. */
  resolvePendingUiDialog(id: string): void {
    this.pendingUiDialogs.resolve(id);
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      notifyRunningChange();
    }
  }

  /** Persist the session identity omp reports in a get_state payload. */
  adoptSessionIdentity(state: RpcSessionState): void {
    if (!state.sessionId) return;
    this._sessionId = state.sessionId;
    this._sessionFile = state.sessionFile ?? this._sessionFile;
  }

  private async getStateWithTimeout(): Promise<RpcSessionState> {
    return this.proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    return dispatchSessionCommand(this, command);
  }

  destroy(): void {
    void this.destroyAndWait();
  }

  /** Destroy and resolve only after the omp child has fully exited. Callers
   * that delete the session file afterwards must await this — omp flushes
   * session state on shutdown and would otherwise recreate the file. */
  async destroyAndWait(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    if (!this._alive) return;
    this._alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribeFrames?.();
    this.pendingUiDialogs.clear();
    this.promptDispatchPendingCount = 0;
    this.awaitingAgentStart = false;
    this.awaitingAgentStartDeadline = 0;
    this.continuationGraceUntil = 0;
    const disposed = this.proc.dispose().catch(() => {});
    this.destroyPromise = disposed;
    notifyRunningChange();
    await disposed;
    this.onDestroyCallback?.();
  }
}

export type { RunningRpcSession, RunningSessionUpdate } from '@/lib/omp/rpc/session-registry';
export { getRpcSession, getRunningRpcSessions, getRunningRpcSessionIds, subscribeRunningSessions, notifyRunningChange, startRpcSession } from '@/lib/omp/rpc/session-registry';
