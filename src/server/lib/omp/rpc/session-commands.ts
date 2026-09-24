/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command dispatch for a live omp session. Extracted from AgentSessionWrapper
 * (rpc-manager.ts) so that file stays under the repo's per-file size ceiling.
 * The host object exposes the wrapper's runtime state; behavior is unchanged.
 */

import { RpcCommandTimeoutError, type RpcProcess } from '@/server/lib/omp/rpc/process';
import { AWAITING_AGENT_START_TIMEOUT_MS, GET_STATE_TIMEOUT_MS, IMAGE_BEARING_COMMANDS, PASSTHROUGH_COMMANDS, PROMPT_ACK_TIMEOUT_MS, RESTARTING_MESSAGE, SESSION_BUSY_MESSAGE, WebRpcError, toImageContents, type AgentEvent, type RpcSessionState, validateAgentImages } from '@/server/lib/omp/rpc/constants';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { scheduleQueueDelivery } from '@/server/lib/queue/delivery.server';
import { clearStreamStatus, markStreamStatus } from '@/shared/lib/omp/session/stream-state.server';
import { buildWebState, type WebStateHost } from '@/server/lib/omp/rpc/web-state';

/** Runtime surface AgentSessionWrapper exposes to the command dispatcher. */
export interface SessionCommandHost extends WebStateHost {
  restarting: boolean;
  proc: RpcProcess;
  isAlive(): boolean;
  /** Anything a reset would destroy: the running turn, a compaction, a shell
   *  command, or live subagents. A timed-out command against a busy session is
   *  queued behind that work, not evidence the child is wedged. */
  isBusy(): boolean;
  /** Real omp session id (empty before the first get_state). */
  sessionId: string;
  emit(event: AgentEvent): void;
  /** One dispatch throat (same surface the wrapper's own send uses). */
  send(command: Record<string, unknown>): Promise<unknown>;
  resetIdleTimer(force?: boolean): void;
  /** Forget a pending ask/approval dialog once its response is sent. */
  resolvePendingUiDialog(id: string): void;
  destroyAndWait(): Promise<void>;
}

/** Decide a command timeout's consequence. omp runs RPC handlers one at a
 *  time, so a late `get_state`/`prompt` ack is usually queued behind the
 *  running turn (or behind a subagent's spawn): resetting that child would
 *  throw away a live turn and every subagent it owns. Only a session that is
 *  demonstrably idle AND unresponsive is reclaimed.
 *
 *  Never throws `session_unresponsive` for a busy session, and never suggests a
 *  retry of a command whose acceptance is unknown. */
async function settleCommandTimeout(host: SessionCommandHost): Promise<never> {
  if (host.isBusy()) throw new WebRpcError(SESSION_BUSY_MESSAGE, 'session_busy');
  await host.destroyAndWait();
  throw new WebRpcError('The OMP session stopped responding and was reset.', 'session_unresponsive');
}

export async function dispatchSessionCommand(host: SessionCommandHost, command: Record<string, unknown>): Promise<unknown> {
  if (host.restarting) throw new WebRpcError(RESTARTING_MESSAGE, 'session_restarting');
  if (!host.isAlive()) throw new Error('Session is no longer running');
  host.resetIdleTimer();
  const type = command.type as string;

  if (IMAGE_BEARING_COMMANDS.has(type)) {
    const imageError = validateAgentImages(command.images);
    if (imageError) throw new Error(imageError);
  }

  switch (type) {
    case 'prompt': {
      if (host.bashRunning) {
        throw new Error('Cannot send a prompt while a shell command is running');
      }
      const streamingBehavior = command.streamingBehavior as 'steer' | 'followUp' | undefined;
      // The live `stream` row starts with the DISPATCH, not with agent_start:
      // the spawn/ack round trip that precedes agent_start must not read as
      // "nothing happened" in the sidebar after the user hit send. Skipped
      // while a turn already streams — that row belongs to the running turn,
      // and this dispatch's failure must never roll it back.
      const ownsStreamRow = !streamingBehavior && !host.streaming && Boolean(host.sessionId);
      // A prompt that never started a turn leaves no run behind, so the row we
      // wrote must go — unless a turn began meanwhile, which owns it now.
      const releaseStreamRow = (): void => {
        if (ownsStreamRow && !host.streaming) void clearStreamStatus(host.sessionId);
      };
      if (!streamingBehavior) {
        host.promptRunning = true;
        host.promptDispatchPendingCount += 1;
        host.awaitingAgentStart = false;
        host.awaitingAgentStartDeadline = 0;
        host.continuationGraceUntil = 0;
        if (ownsStreamRow) void markStreamStatus(host.sessionId, 'stream');
      }
      try {
        const ack = await host.proc.sendCommand<{ agentInvoked?: boolean } | undefined>({
          type: 'prompt',
          message: command.message as string,
          ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
        }, PROMPT_ACK_TIMEOUT_MS);
        if (ack?.agentInvoked === false && !streamingBehavior) {
          host.promptRunning = false;
          host.awaitingAgentStart = false;
          host.awaitingAgentStartDeadline = 0;
          releaseStreamRow();
          host.emit({ type: 'prompt_result', agentInvoked: false });
          // Nothing ran (agent was idle and declined) — the queue may hold the
          // next item; give it the same delivery window a run end would.
          scheduleQueueDelivery(host);
        } else if (!streamingBehavior && ack?.agentInvoked !== false) {
          host.awaitingAgentStart = true;
          host.awaitingAgentStartDeadline = Date.now() + AWAITING_AGENT_START_TIMEOUT_MS;
        }
      } catch (error) {
        host.promptRunning = false;
        host.awaitingAgentStart = false;
        host.awaitingAgentStartDeadline = 0;
        releaseStreamRow();
        // The ack may simply be queued behind a running turn: omp accepts the
        // prompt before the turn it starts. No reset, and the client must not
        // resend — a duplicate prompt would run twice.
        if (error instanceof RpcCommandTimeoutError) await settleCommandTimeout(host);
        throw error;
      } finally {
        if (!streamingBehavior) {
          host.promptDispatchPendingCount = Math.max(0, host.promptDispatchPendingCount - 1);
        }
      }
      return null;
    }

    case 'abort':
      await host.proc.sendCommand({ type: 'abort' });
      host.promptRunning = false;
      host.awaitingAgentStart = false;
      host.awaitingAgentStartDeadline = 0;
      host.continuationGraceUntil = 0;
      if (host.sessionId) void markStreamStatus(host.sessionId, 'abort');
      return null;

    // Escape hatch behind the Stop button: `abort` resolves only once the turn
    // actually stops, so a session wedged on a subagent never answers it. The
    // caller (shared/lib/chat/omp/abort.ts) escalates to this after a grace
    // period and accepts losing the in-flight work.
    case 'force_reset':
      await host.destroyAndWait();
      return null;

    case 'get_state': {
      try {
        const state = await host.proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
        return buildWebState(host, state);
      } catch (error) {
        if (error instanceof RpcCommandTimeoutError) await settleCommandTimeout(host);
        throw error;
      }
    }

    case 'set_model': {
      const { provider, modelId } = command as { provider: string; modelId: string };
      const model = await host.proc.sendCommand<{ id: string; provider: string }>({ type: 'set_model', provider, modelId });
      return { id: model.id, provider: model.provider };
    }

    case 'set_fast_mode': {
      const enabled = command.enabled === true;
      const result = await host.proc.sendCommand<{ enabled?: boolean; active?: boolean }>({ type: 'set_fast_mode', enabled });
      host.fastModeEnabled = result?.enabled ?? enabled;
      return { enabled: host.fastModeEnabled, active: result?.active ?? false };
    }

    case 'compact': {
      try {
        host.compacting = true;
        try {
          const result = await host.proc.sendCommand<{ summary?: string; tokensBefore?: number; estimatedTokensAfter?: number }>({
            type: 'compact',
            ...(command.customInstructions ? { customInstructions: command.customInstructions } : {}),
          });
          return result;
        } finally {
          host.compacting = false;
        }
      } finally {
        clearSessionFileCaches();
      }
    }

    case 'abort_compaction':
      await host.proc.sendCommand({ type: 'abort' });
      return null;

    case 'set_session_name': {
      const name = (command.name as string | undefined)?.trim();
      if (!name) throw new Error('Session name cannot be empty');
      await host.proc.sendCommand({ type: 'set_session_name', name });
      clearSessionFileCaches();
      return null;
    }

    case 'get_commands': {
      const data = await host.proc.sendCommand<{ commands: unknown[] }>({
        type: 'get_available_commands',
      });
      return data;
    }

    case 'bash': {
      if (host.isRunning()) {
        throw new Error('Cannot run a shell command while the session is busy');
      }
      host.bashRunning = true;
      try {
        return await host.proc.sendCommand<{ output?: string; exitCode?: number }>({ type: 'bash', command: command.command as string });
      } finally {
        host.bashRunning = false;
        clearSessionFileCaches();
      }
    }

    case 'extension_ui_response': {
      // Fire-and-forget: omp answers ask/approval dialogs without a response
      // frame, so a request/response round-trip would time out.
      const { id, ...rest } = command as { id: string; [key: string]: unknown };
      if (!id) throw new Error('extension_ui_response requires an id');
      host.proc.sendFrame({ type: 'extension_ui_response', id, ...rest });
      // Answered — stop offering it to clients that attach later.
      host.resolvePendingUiDialog(id);
      return null;
    }

    case 'steer':
    case 'follow_up': {
      if (!host.isRunning()) {
        throw new WebRpcError('The session is idle — start a prompt first.', 'session_idle');
      }
      await host.proc.sendCommand({
        type,
        message: command.message as string,
        ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
      });
      return null;
    }

    default: {
      if (PASSTHROUGH_COMMANDS.has(type)) {
        const result: unknown = await host.proc.sendCommand(command as { type: string });
        if (type === 'set_thinking_level') clearSessionFileCaches();
        return result ?? null;
      }
      throw new Error(`Unsupported command: ${type}`);
    }
  }
}
