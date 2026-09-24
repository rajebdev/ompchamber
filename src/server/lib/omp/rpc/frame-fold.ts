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
  const result: FrameFoldResult = { suppressForward: false };

  switch (event.type) {
    case 'agent_start':
      host.promptRunning = true;
      host.streaming = true;
      host.awaitingAgentStart = false;
      host.awaitingAgentStartDeadline = 0;
      host.continuationGraceUntil = 0;
      // One early auto-title attempt per run, not per conversation: the flag is
      // reset here so a run that opens after an aborted one (which skipped the
      // settle attempt) still gets its own early try. The eligibility latch is
      // what bounds this to the conversation's first run.
      host.autoTitleRequested = false;
      clearSessionFileCaches();
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
    case 'message_end': {
      // A settled USER message is the earliest point at which the transcript
      // carries the conversation's opening intent, so it is the earliest a
      // title can be derived from it.
      //
      // `agent_start` is too early, and that is not an implementation detail
      // but a property of omp's event order: the agent loop pushes
      // `agent_start` BEFORE the turn opens, and the user's message rides
      // `emitInputMessages` inside that turn. Measured on omp 18.3.0: the
      // user message lands ~120ms after `agent_start`, so a `/rename` fired
      // there reads `messageCount: 0`, builds an empty title context, and omp
      // answers "Could not generate a session title". `message_start` is
      // equally too early — the message is appended to the agent's state on
      // `message_end`, so only here does `get_state` report it.
      //
      // The latch makes a later user message (a queued steer) a no-op, and a
      // session that resumed an existing conversation is ineligible from the
      // start. `agent_end` below retries if this attempt produced nothing.
      const message = event.message as Record<string, unknown> | undefined;
      if (message?.role === 'user') void triggerAutoSessionTitle(host, 'opening');
      break;
    }
    // `turn_end` is deliberately NOT handled here: a multi-turn run emits it for
    // EVERY turn (verified against omp 18.2.8: agent_start → turn_start →
    // turn_end('toolUse') → turn_start → turn_end('stop') → agent_end) and the
    // frame carries no isTerminal field, so no turn-level stopReason can be read
    // as "the run is over". The terminal badge is written from `agent_end`
    // alone (markEndStatus), which is the only frame that knows.
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
        // Fallback for the early attempt: the first user message fires `/rename`
        // before the turn runs, and that attempt can come back empty (a provider
        // error, a timeout, a child that went away, or the tiny model
        // declining). The run end is the last moment a title can still be
        // derived from this conversation's OPENING turn, so retry here.
        //
        // An aborted run still skips: the operator stopped the turn, and the
        // next completed run is a better moment than a half-run transcript.
        if (!aborted) void triggerAutoSessionTitle(host, 'settle');
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
      // row. But the chamber fires its own `/rename` in the background, and omp
      // answers it on the same frame — "Session renamed to …", or "Could not
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
