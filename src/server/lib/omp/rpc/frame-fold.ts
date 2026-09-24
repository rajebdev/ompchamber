/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Folds one omp RPC frame into the session wrapper's runtime state, and runs
 * the settle-time side effects a terminal run triggers.
 *
 * Mirrors the client's `foldAgentEvent` (shared/lib/chat/omp/agent-events.ts):
 * the same shape of problem — one frame, many state flags — solved the same way
 * so both ends of the transport read alike. Split out of rpc-manager.ts so the
 * wrapper owns only process lifecycle.
 *
 * The state machine is the load-bearing part. `turn_end` fires for EVERY turn
 * in a multi-turn run, `agent_end` is the only frame that knows whether the run
 * is terminal, and a `prompt` response that failed must clear the same flags a
 * successful settle does — a missed clear strands the session as "running" and
 * the idle reclaim can never take it back.
 */

import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import {
  consumeAutoTitleOutput,
  triggerAutoSessionTitle,
  type AutoTitleHost,
} from '@/server/lib/omp/session/auto-title.server';
import { scheduleQueueDelivery, type QueueDeliveryHost } from '@/server/lib/queue/delivery.server';
import { loadStreamStatuses, markStreamStatus } from '@/shared/lib/omp/session/stream-state.server';
import { NON_TERMINAL_CONTINUATION_GRACE_MS, type AgentEvent } from '@/server/lib/omp/rpc/constants';

/**
 * Wrapper surface the fold reads and writes. Every field is owned by the
 * wrapper; the fold mutates them in place exactly as the inline switch did.
 * Composes the two host contracts the settle path hands the wrapper to
 * (auto-title, queue delivery) so the wrapper itself satisfies this whole type.
 */
export interface SessionFrameHost extends AutoTitleHost, QueueDeliveryHost {
  promptRunning: boolean;
  streaming: boolean;
  compacting: boolean;
  awaitingAgentStart: boolean;
  awaitingAgentStartDeadline: number;
  continuationGraceUntil: number;
  emit(event: AgentEvent): void;
  /** Remember a blocking ask/approval dialog so a reattaching client can answer it. */
  trackUiDialog(frame: AgentEvent): void;
  /** Fold a subagent frame into the liveness roster. */
  observeSubagent(frame: AgentEvent, now: number): void;
}

/** What the caller must do after the fold. */
export interface FrameFoldResult {
  /** The session list is stale and needs a rebuild. */
  refreshSessionList: boolean;
  /** The fold already handled this frame's user-visible effect and the caller
   *  must NOT forward it: a failed `prompt` response has emitted its own
   *  `prompt_error`, and a `command_output` belonging to the chamber's own
   *  background rename must stay out of the timeline. */
  suppressForward: boolean;
}

/** True when the ending turn was a user abort rather than a natural stop. */
function endedAborted(messages: unknown): boolean {
  return (
    Array.isArray(messages) &&
    messages.some((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      return (entry as Record<string, unknown>).stopReason === 'aborted';
    })
  );
}

/**
 * Write the terminal stream badge from the ending turn's own stopReason.
 *
 * The `abort` command already wrote `abort` at dispatch time, but the
 * `agent_end` frame arrives later and previously flattened it to `finish`.
 * Re-check the current row and only upgrade `stream` rows, so a `finish`
 * written here can never clobber a newer run's live `stream`/`abort`.
 */
async function markEndStatus(sessionId: string, messages: unknown): Promise<void> {
  if (!sessionId) return;
  const current = await loadStreamStatuses();
  if (current[sessionId] !== 'stream') return;
  await markStreamStatus(sessionId, endedAborted(messages) ? 'abort' : 'finish');
}

/** Apply one frame to the wrapper's runtime state. */
export function foldSessionFrame(host: SessionFrameHost, event: AgentEvent): FrameFoldResult {
  const result: FrameFoldResult = { refreshSessionList: false, suppressForward: false };

  switch (event.type) {
    case 'agent_start':
      host.promptRunning = true;
      host.streaming = true;
      host.awaitingAgentStart = false;
      host.awaitingAgentStartDeadline = 0;
      host.continuationGraceUntil = 0;
      clearSessionFileCaches();
      result.refreshSessionList = true;
      if (host.sessionId) void markStreamStatus(host.sessionId, 'stream');
      break;
    case 'turn_start':
      // Redundant with agent_start in the happy path, but the run-level
      // counterpart can be missed (e.g. the state was cleared by a command
      // between frames). The turn is proof enough the session is live.
      if (host.sessionId) void markStreamStatus(host.sessionId, 'stream');
      break;
    case 'message_start':
      // Same recovery as turn_start: a message frame is only emitted inside a
      // live run, so its arrival re-arms the `stream` row no matter what stale
      // status sits there (upsert overwrites any terminal badge).
      if (host.sessionId) void markStreamStatus(host.sessionId, 'stream');
      break;
    case 'turn_end': {
      // A multi-turn run emits turn_end for EVERY turn — intermediates end with
      // `toolUse`/`stop` while the run keeps going (verified against omp
      // 18.2.8: agent_start → turn_start → turn_end('toolUse') → turn_start →
      // turn_end('stop') → agent_end, and the frame carries no isTerminal
      // field). Only `aborted` is unambiguous here: the run is over, so the
      // abort badge can be written before agent_end arrives. Everything else
      // waits for agent_end, which knows isTerminal.
      if (!host.sessionId) break;
      const turn = event.message as Record<string, unknown> | undefined;
      if (turn?.stopReason === 'aborted') void markStreamStatus(host.sessionId, 'abort');
      break;
    }
    case 'agent_end':
      if (event.isTerminal !== false) {
        host.streaming = false;
        host.promptRunning = false;
        host.awaitingAgentStart = false;
        host.awaitingAgentStartDeadline = 0;
        host.continuationGraceUntil = 0;
        clearSessionFileCaches();
        const aborted = endedAborted(event.messages);
        if (host.sessionId) void markEndStatus(host.sessionId, event.messages);
        // A settled run is the moment a session becomes nameable: omp's own
        // first-message titling is suppressed under `--mode rpc-ui`
        // (PI_NO_TITLE), so the chamber asks for the same title itself. The
        // trigger is one-shot per conversation — see triggerAutoSessionTitle
        // for why a later turn must never re-ask.
        if (!aborted) void triggerAutoSessionTitle(host);
        // The run truly ended — the server, not the browser, decides whether a
        // queued follow-up goes out next. A user-aborted run holds the queue
        // (stop-all semantics): the next run end or an explicit send picks it up.
        if (!aborted) scheduleQueueDelivery(host);
      } else {
        host.continuationGraceUntil = Date.now() + NON_TERMINAL_CONTINUATION_GRACE_MS;
      }
      break;
    case 'prompt_result':
      host.promptRunning = false;
      host.awaitingAgentStart = false;
      host.awaitingAgentStartDeadline = 0;
      break;
    case 'auto_compaction_start':
      host.compacting = true;
      break;
    case 'auto_compaction_end':
      host.compacting = false;
      clearSessionFileCaches();
      break;
    case 'command_output':
      // A `command_output` for a command the OPERATOR typed renders as a notice
      // row. But the chamber fires its own `/rename` after a settled run, and
      // omp answers it on the same frame — "Session renamed to …", or "Could not
      // generate a session title" for a low-signal first message. Neither was
      // asked for, and the second would be pure noise. The frame carries no
      // correlation id, so attribution is by the request window.
      result.suppressForward = consumeAutoTitleOutput(host);
      break;
    case 'session_info_update':
      // A rename rewrote the fixed-width title slot in place; the scan cache is
      // keyed on file mtime, which that write cannot move, so the list must be
      // rebuilt explicitly.
      clearSessionFileCaches();
      result.refreshSessionList = true;
      break;
    case 'extension_ui_request':
      host.trackUiDialog(event);
      break;
    // Subagent frames carry no turn state, but they are the only proof that
    // work is still running once the parent turn has ended.
    case 'subagent_lifecycle':
    case 'subagent_progress':
    case 'subagent_event':
      host.observeSubagent(event, Date.now());
      break;
    case 'response': {
      if (event.success === false && event.command === 'prompt') {
        host.promptRunning = false;
        host.awaitingAgentStart = false;
        host.awaitingAgentStartDeadline = 0;
        host.emit({ type: 'prompt_error', errorMessage: (event.error as string) ?? 'Prompt failed' });
        // The caller's trailing notify covers this: promptRunning just flipped,
        // so the running snapshot changes and the listeners fire. Suppress only
        // the forward, or the error would land twice.
        result.suppressForward = true;
      }
      break;
    }
  }

  return result;
}
