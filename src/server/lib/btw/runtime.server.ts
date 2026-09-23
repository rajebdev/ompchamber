/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One BTW topic's live side conversation.
 *
 * The side question runs in a second `omp --mode rpc-ui` child that resumes the
 * topic's own transcript — a snapshot of the parent session taken when the
 * topic first asks. That gives the parent's context as real provider messages
 * (no re-prompting it as text, and the parent's prompt-cache prefix survives),
 * never writes the parent file, and disables the tool surface exactly like
 * omp's TUI `/btw` (`--no-tools`; the prompt itself says "NEVER use tools").
 *
 * The child is disposable by design: history lives in SQLite plus the topic
 * transcript, so an idle reclaim costs a respawn, not the conversation — a
 * follow-up resumes the transcript and still sees every earlier turn.
 */

import { RpcProcess, type RpcFrame } from '@/server/lib/omp/rpc/process';
import { GET_STATE_TIMEOUT_MS, IDLE_DESTROY_MS, PROMPT_ACK_TIMEOUT_MS, READY_TIMEOUT_MS, type RpcSessionState } from '@/server/lib/omp/rpc/constants';
import { resolveOmpBin } from '@/server/lib/omp/core/cli';
import { buildBtwPrompt } from '@/server/lib/btw/prompt';
import { appendBtwTurn, setBtwTopicLeaf, setBtwTopicModel, settleRunningBtwTurns, updateBtwTurn } from '@/server/lib/btw/store.server';
import { createBtwWorkspace, resolveBtwWorkspacePaths, type BtwWorkspace } from '@/server/lib/btw/session-copy.server';
import { isRecord } from '@/shared/lib/util/guards';
import { finalAnswer, finalStatus, isAnswerableUiMethod } from '@/server/lib/btw/frames';
import type { AgentImage, BtwFrame, BtwModel, BtwTurnStatus } from '@/shared/types';

/** Longest an aborted turn may stay unsettled before its child is reclaimed. */
const ABORT_GRACE_MS = 10_000;

/** Prompt images, validated by the route before they reach the child. */
export type BtwImages = AgentImage[];

export interface BtwRuntimeContext {
  topicId: string;
  sessionId: string;
  /** Parent session file the topic's transcript was snapshotted from. */
  parentSessionFile: string;
  cwd: string;
  model?: BtwModel;
}

/** Where the runtime reports what happened. */
export interface BtwRuntimeSink {
  /** One frame for every client watching this session's btw stream. */
  publish(frame: BtwFrame): void;
  /** The session's topics changed — re-read the state and republish it. */
  stateChanged(): void;
}

export class BtwError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BtwError';
    this.code = code;
  }
}

export class BtwRuntime {
  private proc: RpcProcess | null = null;
  private starting: Promise<RpcProcess> | null = null;
  private workspace: BtwWorkspace | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private abortTimer: NodeJS.Timeout | null = null;
  private lastIdleReset = 0;
  private turnIndex: number | null = null;
  private settling = false;
  private answer = '';
  private disposing: Promise<void> | null = null;

  constructor(
    private readonly context: BtwRuntimeContext,
    private readonly sink: BtwRuntimeSink,
  ) {}

  get topicId(): string {
    return this.context.topicId;
  }

  get sessionId(): string {
    return this.context.sessionId;
  }

  /** A question is in flight in this topic. */
  get running(): boolean {
    return this.turnIndex !== null;
  }

  /** True from the moment a turn starts settling until its row is written:
   *  the state repair must treat this topic as live, or it would overwrite the
   *  turn's own status with `interrupted`. */
  get busy(): boolean {
    return this.settling;
  }

  /** Ask (or follow up) — the caller has already refused concurrent turns. */
  async ask(question: string, images?: BtwImages): Promise<void> {
    if (this.running) throw new BtwError('A side question is already running here.', 'btw_busy');
    this.turnIndex = await appendBtwTurn(this.topicId, question);
    this.answer = '';
    this.sink.stateChanged();
    try {
      const proc = await this.start();
      await proc.sendCommand(
        { type: 'prompt', message: buildBtwPrompt(question), ...(images?.length ? { images } : {}) },
        PROMPT_ACK_TIMEOUT_MS,
      );
    } catch (error) {
      await this.settle('failed');
      this.sink.publish({
        type: 'btw_error',
        topicId: this.topicId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.resetIdleTimer(true);
  }

  /** Cancel the running question, keeping whatever text already arrived. */
  async abort(): Promise<void> {
    if (!this.running) return;
    const proc = this.proc;
    if (!proc?.isAlive) {
      await this.settle('cancelled');
      return;
    }
    try {
      await proc.sendCommand({ type: 'abort' }, GET_STATE_TIMEOUT_MS);
    } catch {
      // An unanswered abort is the escalate-to-cancel path below, not an error.
    }
    if (this.abortTimer) clearTimeout(this.abortTimer);
    const timer = setTimeout(() => {
      this.abortTimer = null;
      void this.disposeIfUnsettled();
    }, ABORT_GRACE_MS);
    timer.unref?.();
    this.abortTimer = timer;
  }

  /** Reclaim the child; the topic's history survives in SQLite and on disk. */
  async dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    if (this.running) {
      // A turn would die with the child — settle it rather than lose the answer.
      await this.settle('cancelled');
    }
    this.disposing = this.teardown();
    return this.disposing;
  }

  private async teardown(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.abortTimer) clearTimeout(this.abortTimer);
    this.idleTimer = null;
    this.abortTimer = null;
    const proc = this.proc;
    this.proc = null;
    if (proc) await proc.dispose().catch(() => {});
    this.disposing = null;
  }

  private async disposeIfUnsettled(): Promise<void> {
    if (this.running) await this.settle('cancelled');
    await this.dispose();
  }

  private ensureWorkspace(): Promise<BtwWorkspace> {
    if (this.workspace) return Promise.resolve(this.workspace);
    return this.openWorkspace();
  }

  /** The topic's transcript: created from the parent on first use, resumed
   *  afterwards so a respawn continues the same side conversation. */
  private async openWorkspace(): Promise<BtwWorkspace> {
    const paths = await resolveBtwWorkspacePaths(this.context.sessionId, this.context.topicId);
    const existing = await Bun.file(paths.sessionFile).exists();
    const workspace = existing
      ? { ...paths, leafId: null }
      : await createBtwWorkspace({
          parentSessionId: this.context.sessionId,
          topicId: this.context.topicId,
          parentSessionFile: this.context.parentSessionFile,
        });
    this.workspace = workspace;
    // The snapshot's leaf is what a later promotion must still find in the
    // parent; a topic resumed from disk keeps the leaf it was created with.
    if (workspace.leafId) await setBtwTopicLeaf(this.context.topicId, workspace.leafId);
    return workspace;
  }

  private start(): Promise<RpcProcess> {
    if (this.starting) return this.starting;
    const started = this.spawnChild();
    this.starting = started;
    void started
      .catch(() => {})
      .finally(() => {
        if (this.starting === started) this.starting = null;
      });
    return started;
  }

  private async spawnChild(): Promise<RpcProcess> {
    const bin = resolveOmpBin();
    if (!bin) throw new BtwError('The omp binary could not be found.', 'btw_unavailable');
    const workspace = await this.ensureWorkspace();
    const model = this.context.model;
    const proc = new RpcProcess({
      cwd: this.context.cwd,
      extraArgs: [
        '--resume',
        workspace.sessionFile,
        // Side questions never touch tools, so no approval mode is needed.
        '--no-tools',
        // Auto-titling would spend a model call on a transcript nobody lists.
        '--no-title',
        ...(model ? ['--model', `${model.provider}/${model.id}`] : []),
      ],
      onFrame: (frame) => this.handleFrame(frame),
      onExit: (info) => this.handleExit(info.stderrTail),
    });
    this.proc = proc;
    const ready = await proc.waitReady(READY_TIMEOUT_MS);
    await proc.negotiateProtocol(ready);
    await this.captureModel(proc);
    return proc;
  }

  /** Record the display name the child reports, for the panel's model chip. */
  private async captureModel(proc: RpcProcess): Promise<void> {
    try {
      const state = await proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
      const reported = state.model;
      if (reported?.provider && reported.id && reported.name) {
        await setBtwTopicModel(this.context.topicId, { provider: reported.provider, id: reported.id, name: reported.name });
        this.sink.stateChanged();
      }
    } catch {
      // A chip without a display name is cosmetic; the topic keeps its model.
    }
  }

  private handleFrame(frame: RpcFrame): void {
    if (frame.type === 'message_update') {
      const event = frame.assistantMessageEvent;
      if (isRecord(event) && event.type === 'text_delta' && typeof event.delta === 'string' && this.turnIndex !== null) {
        this.answer += event.delta;
        this.sink.publish({ type: 'btw_delta', topicId: this.topicId, turnIndex: this.turnIndex, text: event.delta });
      }
    } else if (frame.type === 'agent_end') {
      // `isTerminal: false` means maintenance scheduled more work; the turn is
      // not done until a terminal end arrives (mirrors the session wrapper).
      if (frame.isTerminal === false) return;
      void this.settle(finalStatus(frame.messages), finalAnswer(frame.messages, this.answer));
    } else if (frame.type === 'extension_ui_request') {
      this.answerExtensionUi(frame);
    }
    this.resetIdleTimer();
  }

  /** A side session has no UI: release any dialog omp parks on, so it can
   *  never block a turn that the panel is waiting on. */
  private answerExtensionUi(frame: RpcFrame): void {
    const id = frame.id;
    if (typeof id !== 'string' || !isAnswerableUiMethod(frame.method)) return;
    this.proc?.sendFrame({ type: 'extension_ui_response', id, cancelled: true });
  }

  private async settle(status: BtwTurnStatus, answer?: string): Promise<void> {
    const turnIndex = this.turnIndex;
    if (turnIndex === null) return;
    this.turnIndex = null;
    const text = answer ?? this.answer;
    this.answer = '';
    // `busy` holds the topic live across the write: a state read that lands in
    // this window must not settle the row as `interrupted` (see `btwStateFor`).
    this.settling = true;
    try {
      await updateBtwTurn(this.topicId, turnIndex, { answer: text, status });
    } finally {
      this.settling = false;
      this.sink.stateChanged();
    }
  }

  private handleExit(stderrTail: string): void {
    const wasRunning = this.running;
    this.proc = null;
    if (!wasRunning) return;
    void settleRunningBtwTurns(this.topicId, 'interrupted').then(() => {
      this.turnIndex = null;
      this.answer = '';
      this.sink.stateChanged();
      const detail = stderrTail.trim().split('\n').pop();
      this.sink.publish({
        type: 'btw_error',
        topicId: this.topicId,
        message: `The side session exited before answering${detail ? `: ${detail}` : '.'}`,
      });
    });
  }

  private resetIdleTimer(force = false): void {
    const now = Date.now();
    if (!force && this.idleTimer && now - this.lastIdleReset < 5_000) return;
    this.lastIdleReset = now;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const timer = setTimeout(() => {
      if (this.running) {
        this.resetIdleTimer(true);
        return;
      }
      void this.dispose();
    }, IDLE_DESTROY_MS);
    timer.unref?.();
    this.idleTimer = timer;
  }
}
