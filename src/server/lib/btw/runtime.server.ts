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
 * (no re-prompting it as text, and the parent's prompt-cache prefix survives)
 * and never writes the parent file.
 *
 * The child runs WITH tools, unlike omp's TUI `/btw` (`--no-tools`). The panel
 * offers a real access-control dropdown, and an approval mode that governs
 * nothing would be a lie in the UI — so the tool surface is whatever
 * `--approval-mode` allows, and a gated call parks the turn on an
 * `extension_ui_request` the panel answers (`PendingUiDialogs`).
 *
 * The child is disposable by design: history lives in SQLite plus the topic
 * transcript, so an idle reclaim costs a respawn, not the conversation — a
 * follow-up resumes the transcript and still sees every earlier turn.
 *
 * This class owns the process and the frame routing; the rules about what a turn
 * is worth live in `lifecycle.server.ts`.
 */

import { RpcProcess, type RpcFrame } from '@/server/lib/omp/rpc/process';
import { GET_STATE_TIMEOUT_MS, READY_TIMEOUT_MS, type RpcSessionState } from '@/server/lib/omp/rpc/constants';
import { PendingUiDialogs } from '@/server/lib/omp/rpc/pending-ui-dialogs';
import { resolveOmpBin } from '@/server/lib/omp/core/cli';
import { buildBtwSpawnArgs, type BtwSpawnSettings } from '@/server/lib/btw/child.server';
import {
  abortSideTurn,
  askSideQuestion,
  handleSideChildExit,
  resetSideIdleTimer,
  settleSideTurn,
  teardownSideChild,
  trackTurnActivity,
  trackTurnMessage,
  type BtwLifecycleHost,
} from '@/server/lib/btw/lifecycle.server';
import { setBtwTopicModel, setBtwTopicThinkingLevel } from '@/server/lib/btw/store.server';
import { createBtwWorkspace, resolveBtwWorkspacePaths, type BtwWorkspace } from '@/server/lib/btw/session-copy.server';
import { finalAnswer, finalStatus, isAnswerableUiMethod } from '@/server/lib/btw/frames';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import type { AgentImage, BtwFrame, BtwLiveTurn, BtwModel, BtwTurnStatus, ChatMessageData } from '@/shared/types';

/** Prompt images, validated by the route before they reach the child. */
export type BtwImages = AgentImage[];

export interface BtwRuntimeContext {
  topicId: string;
  sessionId: string;
  /** Parent session file the topic's transcript was snapshotted from. */
  parentSessionFile: string;
  cwd: string;
  model?: BtwModel;
  thinkingLevel?: string;
  approvalMode?: ApprovalMode;
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

export class BtwRuntime implements BtwLifecycleHost {
  proc: RpcProcess | null = null;
  private starting: Promise<RpcProcess> | null = null;
  private workspace: BtwWorkspace | null = null;
  idleTimer: NodeJS.Timeout | null = null;
  abortTimer: NodeJS.Timeout | null = null;
  lastIdleReset = 0;
  turnIndex: number | null = null;
  settling = false;
  /** The turn's conversation so far (chat-shaped; see `trackTurnMessage`). */
  messages: ChatMessageData[] = [];
  /** Last activity phrase published, so repeats are not re-published. */
  activity = '';
  disposing: Promise<void> | null = null;
  /** Ask/approval dialogs this child is blocked on (see the module note). */
  readonly dialogs = new PendingUiDialogs();
  /** The approval mode the live child was actually spawned with. */
  spawnedApprovalMode: ApprovalMode | undefined;

  constructor(
    private readonly context: BtwRuntimeContext,
    readonly sink: BtwRuntimeSink,
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

  /** The in-flight turn as the server has accumulated it, for `btw_state`. */
  liveTurn(): BtwLiveTurn | null {
    if (this.turnIndex === null) return null;
    return {
      topicId: this.topicId,
      turnIndex: this.turnIndex,
      messages: this.messages,
      activity: this.activity,
    };
  }

  ask(question: string, images?: BtwImages): Promise<void> {
    return askSideQuestion(this, question, images);
  }

  abort(): Promise<void> {
    return abortSideTurn(this);
  }

  /**
   * Re-target the live child's model. `set_model` applies to the RUNNING turn
   * (omp resolves it immediately), which is exactly what the panel's dropdown
   * promises: the answer in flight continues on the model the user just chose.
   */
  async setModel(provider: string, modelId: string): Promise<void> {
    await setBtwTopicModel(this.topicId, { provider, id: modelId });
    this.sink.stateChanged();
    const proc = this.proc;
    if (!proc?.isAlive) return;
    await proc.sendCommand({ type: 'set_model', provider, modelId }, GET_STATE_TIMEOUT_MS);
  }

  /** Re-target the live child's thinking level (`auto` leaves omp alone). */
  async setThinkingLevel(level: string): Promise<void> {
    const proc = this.proc;
    if (!proc?.isAlive || level === 'auto') return;
    await proc.sendCommand({ type: 'set_thinking_level', level }, GET_STATE_TIMEOUT_MS);
  }

  /**
   * Adopt a new approval mode. omp has no RPC for it — the flag is spawn-time
   * only — so an idle child is destroyed and the next question respawns it.
   * A running turn is never killed for this (same rule as the chat session's
   * `reconcileSpawnApprovalMode`): the mode takes effect from the next child.
   */
  async setApprovalMode(mode: ApprovalMode): Promise<void> {
    this.context.approvalMode = mode;
    if (this.spawnedApprovalMode === mode || this.running) return;
    await this.teardownChild();
  }

  /** Answer a dialog this child is blocked on. */
  respondToDialog(id: string, response: Record<string, unknown>): void {
    this.proc?.sendFrame({ type: 'extension_ui_response', id, ...response });
    if (this.dialogs.resolve(id)) this.sink.stateChanged();
  }

  /** Reclaim the child; the topic's history survives in SQLite and on disk. */
  async dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    if (this.running) {
      // A turn would die with the child — settle it rather than lose the answer.
      await settleSideTurn(this, 'cancelled');
    }
    this.disposing = this.teardownChild();
    return this.disposing;
  }

  async teardownChild(): Promise<void> {
    await teardownSideChild(this);
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
    return workspace;
  }

  start(): Promise<RpcProcess> {
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
    const settings: BtwSpawnSettings = {
      model: this.context.model,
      thinkingLevel: this.context.thinkingLevel,
      approvalMode: this.context.approvalMode,
    };
    const proc = new RpcProcess({
      cwd: this.context.cwd,
      extraArgs: buildBtwSpawnArgs(workspace.sessionFile, settings),
      onFrame: (frame) => this.handleFrame(frame),
      onExit: (info) => handleSideChildExit(this, info.stderrTail),
    });
    this.proc = proc;
    this.spawnedApprovalMode = this.context.approvalMode;
    const ready = await proc.waitReady(READY_TIMEOUT_MS);
    await proc.negotiateProtocol(ready);
    await this.captureModel(proc);
    return proc;
  }

  /**
   * Record what the child reports about itself, for the panel's model chip and
   * the run footer: its display name and the thinking level it actually runs at.
   * `get_state` is the only source — the topic row holds what was REQUESTED, and
   * omp may resolve it differently.
   */
  private async captureModel(proc: RpcProcess): Promise<void> {
    try {
      const state = await proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
      const reported = state.model;
      if (reported?.provider && reported.id && reported.name) {
        await setBtwTopicModel(this.topicId, { provider: reported.provider, id: reported.id, name: reported.name });
        this.sink.stateChanged();
      }
      if (typeof state.thinkingLevel === 'string' && state.thinkingLevel) {
        await setBtwTopicThinkingLevel(this.topicId, state.thinkingLevel);
        this.sink.stateChanged();
      }
    } catch {
      // A chip without a display name is cosmetic; the topic keeps its model.
    }
  }

  private handleFrame(frame: RpcFrame): void {
    if (frame.type === 'message_update' || frame.type === 'message_start') {
      // The turn's conversation is accumulated in the chat's own shape (see
      // `trackTurnMessage`): thinking, prose, tool calls and their output all
      // reach the panel through the same mapper the chat timeline uses.
      trackTurnMessage(this, frame);
      trackTurnActivity(this, frame);
    } else if (frame.type === 'message_end') {
      // The completed message is the authoritative copy: it carries the turn's
      // real usage, where the streaming frames report zeros. Upserting it
      // replaces the streaming row in place (same message id), which is what
      // puts token counts on the panel's run footer.
      trackTurnMessage(this, frame);
    } else if (frame.type === 'tool_execution_start') {
      trackTurnActivity(this, frame);
    } else if (frame.type === 'agent_end') {
      // `isTerminal: false` means maintenance scheduled more work; the turn is
      // not done until a terminal end arrives (mirrors the session wrapper).
      if (frame.isTerminal === false) return;
      void settleSideTurn(this, finalStatus(frame.messages), finalAnswer(frame.messages, ''));
    } else if (frame.type === 'extension_ui_request') {
      this.trackDialog(frame);
    }
    resetSideIdleTimer(this);
  }

  /**
   * Record an ask/approval dialog so the panel can render it. Unlike the TUI
   * there is no tool card to host an `ask` inline, so every answerable request
   * becomes a modal — and the state republish is what puts it on screen.
   */
  private trackDialog(frame: RpcFrame): void {
    if (typeof frame.id !== 'string' || !isAnswerableUiMethod(frame.method)) return;
    if (this.dialogs.track(frame)) this.sink.stateChanged();
  }
}

export type { BtwTurnStatus };
