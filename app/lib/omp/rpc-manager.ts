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

import { existsSync } from 'fs';
import { homedir } from 'os';
import { RpcCommandTimeoutError, RpcProcess, type RpcFrame } from './rpc-process';
import { clearSessionFileCaches } from './session-files';

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

export interface RpcSessionState {
  sessionId: string;
  sessionFile?: string;
  sessionName?: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled?: boolean;
  interruptMode: 'immediate' | 'wait';
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  model?: { id: string; provider: string; name?: string; reasoning?: boolean; thinking?: { efforts?: string[] } };
  messageCount: number;
  queuedMessageCount: number;
  contextUsage?: { tokens: number; contextWindow: number; percent: number } | null;
  systemPrompt?: string[];
  thinkingLevel?: string;
  fastMode?: boolean;
  fastModeEnabled?: boolean;
  fastModeActive?: boolean;
  tokensPerSecond?: number | null;
  todoPhases?: unknown[];
}

export interface WebSessionState {
  sessionId: string;
  sessionFile: string;
  sessionName?: string;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled?: boolean;
  interruptMode: 'immediate' | 'wait';
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  model?: { id: string; provider: string; name?: string; reasoning?: boolean; thinking?: { efforts?: string[] } };
  messageCount: number;
  queuedMessageCount: number;
  contextUsage: { tokens: number; contextWindow: number; percent: number } | null;
  systemPrompt: string;
  thinkingLevel: string;
  fastModeEnabled: boolean;
  fastModeActive?: boolean;
  tokensPerSecond: number | null;
  todoPhases: unknown[];
}

const IDLE_DESTROY_MS = 10 * 60 * 1000;
const READY_TIMEOUT_MS = 120_000;
const GET_STATE_TIMEOUT_MS = 5_000;
const PROMPT_ACK_TIMEOUT_MS = 30_000;
const NON_TERMINAL_CONTINUATION_GRACE_MS = 2_000;
const AWAITING_AGENT_START_TIMEOUT_MS = 10_000;
const RESTARTING_MESSAGE = 'This session is restarting — retry in a moment.';

export class WebRpcError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WebRpcError';
    this.code = code;
  }
}

// Commands forwarded to omp verbatim (request shape already matches rpc-types).
const PASSTHROUGH_COMMANDS = new Set([
  'abort',
  'abort_and_prompt',
  'set_thinking_level',
  'cycle_thinking_level',
  'cycle_model',
  'get_available_models',
  'set_auto_compaction',
  'set_auto_retry',
  'abort_retry',
  'abort_bash',
  'set_todos',
  'set_steering_mode',
  'set_follow_up_mode',
  'set_interrupt_mode',
  'get_messages',
  'get_messages_page',
  'get_subagents',
  'get_subagent_messages',
  'set_subagent_subscription',
  'get_login_providers',
  'login',
]);

// Commands that can carry user-attached images to the model. All of them must
// pass the same server-side per-image/count/aggregate validation before the
// payload reaches omp — a client is free to POST any of them directly.
const IMAGE_BEARING_COMMANDS = new Set(['prompt', 'steer', 'follow_up', 'abort_and_prompt']);

const MAX_ATTACHED_IMAGES = 20;
const MAX_ATTACHED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_AGGREGATE_IMAGE_BYTES = 40 * 1024 * 1024;

function validateAgentImages(images: unknown): string | null {
  if (images === undefined) return null;
  if (!Array.isArray(images)) return 'images must be an array';
  if (images.length > MAX_ATTACHED_IMAGES) return `Maximum of ${MAX_ATTACHED_IMAGES} attached images reached.`;
  let aggregate = 0;
  for (const image of images) {
    if (!image || typeof image !== 'object') return 'invalid image entry';
    const data = (image as { data?: unknown }).data;
    const mimeType = (image as { mimeType?: unknown }).mimeType;
    if (typeof data !== 'string' || typeof mimeType !== 'string') return 'invalid image entry';
    const bytes = Buffer.byteLength(data, 'base64');
    if (bytes > MAX_ATTACHED_IMAGE_BYTES) return `Images up to ${Math.round(MAX_ATTACHED_IMAGE_BYTES / 1024 / 1024)} MB are supported.`;
    aggregate += bytes;
  }
  if (aggregate > MAX_AGGREGATE_IMAGE_BYTES) return 'Total image size exceeds the supported limit.';
  return null;
}

function toImageContents(value: unknown): Array<{ type: 'image'; data: string; mimeType: string }> | undefined {
  const images = value as Array<{ type: 'image'; data: string; mimeType: string }> | undefined;
  return images?.length ? images : undefined;
}

/** Pick a spawn cwd that actually exists. A session records the directory it
 * was created in, but that directory may have been deleted since: spawn()
 * would fail with ENOENT and `omp --cwd <missing>` throws in setProjectDir. */
export function resolveSpawnCwd(recordedCwd?: string | null): string {
  if (recordedCwd && existsSync(recordedCwd)) return recordedCwd;
  try {
    const serverCwd = process.cwd();
    if (serverCwd && existsSync(serverCwd)) return serverCwd;
  } catch {
    // process.cwd() itself throws when the server's own cwd was removed.
  }
  return homedir();
}

/** Extra CLI args for spawning `omp --mode rpc-ui` for a session. */
export function buildSessionSpawnArgs(sessionFile: string): string[] {
  const args: string[] = [];
  if (sessionFile) {
    // An absolute path resolves deterministically: omp's createSessionManager
    // opens it directly via SessionManager.open without any interactive
    // resume/fork prompts.
    args.push('--resume', sessionFile);
  }
  return args;
}

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private promptRunning = false;
  private promptDispatchPendingCount = 0;
  private awaitingAgentStart = false;
  private awaitingAgentStartDeadline = 0;
  private continuationGraceUntil = 0;
  private bashRunning = false;
  private streaming = false;
  private compacting = false;
  private fastModeEnabled = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private unsubscribeFrames: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;
  private restarting = false;
  private _alive = true;
  destroyPromise: Promise<void> | null = null;
  private _sessionId = '';
  private _sessionFile = '';
  private proc: RpcProcess;
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

  private emit(event: AgentEvent): void {
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
  private resetIdleTimer(force = false): void {
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

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  private async withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      notifyRunningChange();
    }
  }

  private buildWebState(state: RpcSessionState): WebSessionState {
    const wasRunning = this.isRunning();

    this.streaming = state.isStreaming;
    this.compacting = state.isCompacting;
    if (state.sessionId) {
      this._sessionId = state.sessionId;
      this._sessionFile = state.sessionFile ?? this._sessionFile;
    }

    const awaitingExpired = !this.awaitingAgentStart || Date.now() >= this.awaitingAgentStartDeadline;
    const hasPendingWork =
      this.promptDispatchPendingCount > 0 ||
      (this.awaitingAgentStart && !awaitingExpired);

    if (
      state.isStreaming === false &&
      state.isCompacting === false &&
      !hasPendingWork &&
      Date.now() >= this.continuationGraceUntil
    ) {
      this.promptRunning = false;
      this.awaitingAgentStart = false;
      this.awaitingAgentStartDeadline = 0;
    }

    if (wasRunning && !this.isRunning()) {
      notifyRunningChange();
    }
    return {
      sessionId: state.sessionId,
      sessionFile: state.sessionFile ?? '',
      sessionName: state.sessionName,
      isStreaming: state.isStreaming,
      isPromptRunning: this.promptRunning,
      isBashRunning: this.bashRunning,
      isCompacting: state.isCompacting,
      autoCompactionEnabled: state.autoCompactionEnabled,
      autoRetryEnabled: state.autoRetryEnabled,
      interruptMode: state.interruptMode,
      steeringMode: state.steeringMode,
      followUpMode: state.followUpMode,
      model: state.model
        ? {
            id: state.model.id,
            provider: state.model.provider,
            name: state.model.name,
            reasoning: state.model.reasoning,
            thinking: state.model.thinking ? { efforts: state.model.thinking.efforts } : undefined,
          }
        : undefined,
      messageCount: state.messageCount,
      queuedMessageCount: state.queuedMessageCount,
      contextUsage: state.contextUsage ?? null,
      systemPrompt: state.systemPrompt?.join('\n\n') ?? '',
      thinkingLevel: state.thinkingLevel ?? 'off',
      fastModeEnabled: state.fastModeEnabled ?? state.fastMode ?? this.fastModeEnabled,
      fastModeActive: state.fastModeActive,
      tokensPerSecond: state.tokensPerSecond ?? null,
      todoPhases: state.todoPhases ?? [],
    };
  }

  private async getStateWithTimeout(): Promise<RpcSessionState> {
    return this.proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    if (this.restarting) throw new WebRpcError(RESTARTING_MESSAGE, 'session_restarting');
    if (!this.isAlive()) throw new Error('Session is no longer running');
    this.resetIdleTimer();
    const type = command.type as string;

    if (IMAGE_BEARING_COMMANDS.has(type)) {
      const imageError = validateAgentImages(command.images);
      if (imageError) throw new Error(imageError);
    }

    switch (type) {
      case 'prompt': {
        if (this.bashRunning) {
          throw new Error('Cannot send a prompt while a shell command is running');
        }
        const streamingBehavior = command.streamingBehavior as 'steer' | 'followUp' | undefined;
        if (!streamingBehavior) {
          this.promptRunning = true;
          this.promptDispatchPendingCount += 1;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.continuationGraceUntil = 0;
          notifyRunningChange();
        }
        try {
          const ack = await this.proc.sendCommand<{ agentInvoked?: boolean } | undefined>({
            type: 'prompt',
            message: command.message as string,
            ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
            ...(streamingBehavior ? { streamingBehavior } : {}),
          }, PROMPT_ACK_TIMEOUT_MS);
          if (ack?.agentInvoked === false && !streamingBehavior) {
            this.promptRunning = false;
            this.awaitingAgentStart = false;
            this.awaitingAgentStartDeadline = 0;
            this.emit({ type: 'prompt_result', agentInvoked: false });
            notifyRunningChange();
          } else if (!streamingBehavior && ack?.agentInvoked !== false) {
            this.awaitingAgentStart = true;
            this.awaitingAgentStartDeadline = Date.now() + AWAITING_AGENT_START_TIMEOUT_MS;
          }
        } catch (error) {
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          notifyRunningChange();
          if (error instanceof RpcCommandTimeoutError) {
            await this.destroyAndWait();
            throw new WebRpcError('The OMP session stopped responding and was reset.', 'session_unresponsive');
          }
          throw error;
        } finally {
          if (!streamingBehavior) {
            this.promptDispatchPendingCount = Math.max(0, this.promptDispatchPendingCount - 1);
          }
        }
        return null;
      }

      case 'steer':
      case 'follow_up': {
        await this.proc.sendCommand({
          type,
          message: command.message as string,
          ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
        });
        return null;
      }

      case 'abort':
        await this.withFinalRunningNotification(async () => {
          await this.proc.sendCommand({ type: 'abort' });
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.continuationGraceUntil = 0;
        });
        return null;

      case 'get_state': {
        try {
          const state = await this.proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
          return this.buildWebState(state);
        } catch (error) {
          if (error instanceof RpcCommandTimeoutError) {
            await this.destroyAndWait();
            throw new WebRpcError('The OMP session stopped responding and was reset.', 'session_unresponsive');
          }
          throw error;
        }
      }

      case 'set_model': {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const model = await this.proc.sendCommand<{ id: string; provider: string }>({ type: 'set_model', provider, modelId });
        return { id: model.id, provider: model.provider };
      }

      case 'set_fast_mode': {
        const enabled = command.enabled === true;
        const result = await this.proc.sendCommand<{ enabled?: boolean; active?: boolean }>({ type: 'set_fast_mode', enabled });
        this.fastModeEnabled = result?.enabled ?? enabled;
        return { enabled: this.fastModeEnabled, active: result?.active ?? false };
      }

      case 'compact': {
        try {
          return await this.withFinalRunningNotification(async () => {
            this.compacting = true;
            notifyRunningChange();
            try {
              const result = await this.proc.sendCommand<{ summary?: string; tokensBefore?: number; estimatedTokensAfter?: number }>({
                type: 'compact',
                ...(command.customInstructions ? { customInstructions: command.customInstructions } : {}),
              });
              return result;
            } finally {
              this.compacting = false;
            }
          });
        } finally {
          clearSessionFileCaches();
        }
      }

      case 'abort_compaction':
        await this.withFinalRunningNotification(() => this.proc.sendCommand({ type: 'abort' }));
        return null;

      case 'set_session_name': {
        const name = (command.name as string | undefined)?.trim();
        if (!name) throw new Error('Session name cannot be empty');
        await this.proc.sendCommand({ type: 'set_session_name', name });
        clearSessionFileCaches();
        return null;
      }

      case 'get_commands': {
        const data = await this.proc.sendCommand<{ commands: unknown[] }>({
          type: 'get_available_commands',
        });
        return data;
      }

      case 'bash': {
        if (this.isRunning()) {
          throw new Error('Cannot run a shell command while the session is busy');
        }
        this.bashRunning = true;
        notifyRunningChange();
        try {
          return await this.proc.sendCommand<{ output?: string; exitCode?: number }>({ type: 'bash', command: command.command as string });
        } finally {
          this.bashRunning = false;
          clearSessionFileCaches();
          notifyRunningChange();
        }
      }

      case 'extension_ui_response': {
        // Fire-and-forget: omp answers ask/approval dialogs without a response
        // frame, so a request/response round-trip would time out.
        const { id, ...rest } = command as { id: string; [key: string]: unknown };
        if (!id) throw new Error('extension_ui_response requires an id');
        this.proc.sendFrame({ type: 'extension_ui_response', id, ...rest });
        return null;
      }

      default: {
        if (PASSTHROUGH_COMMANDS.has(type)) {
          const result: unknown = await this.proc.sendCommand(command as { type: string });
          if (type === 'set_thinking_level') clearSessionFileCaches();
          return result ?? null;
        }
        throw new Error(`Unsupported command: ${type}`);
      }
    }
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

// ============================================================================
// Session registry
// ============================================================================
export interface RunningRpcSession {
  id: string;
  cwd: string;
}

export interface RunningSessionUpdate {
  ids: string[];
  runningSessions: RunningRpcSession[];
  refreshSessionList: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompSessions: Map<string, AgentSessionWrapper> | undefined;
  // eslint-disable-next-line no-var
  var __ompStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
  // eslint-disable-next-line no-var
  var __ompRunningListeners: Set<(update: RunningSessionUpdate) => void> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__ompSessions) {
    globalThis.__ompSessions = new Map();
    const cleanup = () => globalThis.__ompSessions?.forEach((s) => s.destroy());
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }
  return globalThis.__ompSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__ompStartLocks) globalThis.__ompStartLocks = new Map();
  return globalThis.__ompStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getRunningRpcSessions(): RunningRpcSession[] {
  const map = new Map<string, string>();
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) {
      const realId = session.sessionId || sessionId;
      map.set(realId, session.cwd);
    }
  }
  return [...map.entries()].map(([id, cwd]) => ({ id, cwd }));
}

export function getRunningRpcSessionIds(): string[] {
  return getRunningRpcSessions().map((s) => s.id);
}

function getRunningListeners(): Set<(update: RunningSessionUpdate) => void> {
  if (!globalThis.__ompRunningListeners) globalThis.__ompRunningListeners = new Set();
  return globalThis.__ompRunningListeners;
}

/** Subscribe to running-session-id changes and session-list refreshes. */
export function subscribeRunningSessions(listener: (update: RunningSessionUpdate) => void): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let lastRunningSnapshot = '';

/**
 * Recompute the running-session-id set and, when it changes, broadcast it.
 * A session file may first appear after its id starts running, so callers can
 * force one otherwise-identical update to refresh sidebar session metadata.
 */
export function notifyRunningChange({ refreshSessionList = false }: { refreshSessionList?: boolean } = {}): void {
  const runningSessions = getRunningRpcSessions();
  const ids = runningSessions.map((s) => s.id);
  if (runningSessions.length === 0 && lastRunningSnapshot === '[]' && !refreshSessionList) return;
  const snapshot = JSON.stringify(runningSessions.slice().sort((a, b) => a.id.localeCompare(b.id)));
  if (snapshot === lastRunningSnapshot && !refreshSessionList) return;
  lastRunningSnapshot = snapshot;
  const update: RunningSessionUpdate = { ids, runningSessions, refreshSessionList };
  for (const listener of getRunningListeners()) {
    try { listener(update); } catch { /* ignore listener errors */ }
  }
}

/**
 * Get or create the omp RPC process for the given session.
 * For new sessions (sessionFile === ''), omp generates its own id.
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  recordedCwd?: string | null,
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) {
    return { session: existing, realSessionId: sessionId };
  }
  if (existing?.destroyPromise) await existing.destroyPromise;

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const holder: { wrapper?: AgentSessionWrapper } = {};
    const proc = new RpcProcess({
      cwd,
      extraArgs: buildSessionSpawnArgs(sessionFile),
      onExit: ({ stderrTail }) => holder.wrapper?.handleProcessExit(stderrTail),
    });
    const created = new AgentSessionWrapper(proc, cwd, recordedCwd);
    holder.wrapper = created;
    created.start();
    try {
      await created.waitUntilReady();
    } catch (error) {
      await created.destroyAndWait();
      throw error;
    }

    const realSessionId = created.sessionId;
    created.onDestroy(() => {
      if (registry.get(created.sessionId) === created) registry.delete(created.sessionId);
      if (registry.get(realSessionId) === created) registry.delete(realSessionId);
    });
    registry.set(realSessionId, created);
    return { session: created, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
