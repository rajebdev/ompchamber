/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Folds one live agent event frame into chamber state. Transport-agnostic: the
 * WebSocket and SSE clients both hand every decoded frame to `foldAgentEvent`,
 * so both transports produce byte-identical timeline behavior.
 *
 * Split out of useOmpAgentStream so the hook owns only connection lifecycle
 * (open, reconnect, teardown) and each file stays under the repo's per-file
 * size ceiling.
 */

import type { IncomingExtensionUiRequest, OmpAgentCallbacks, OmpAgentEvent, ToolCallData } from '@/shared/types';
import { extractTextFromContent, toChatMessage, toolResultText } from '@/shared/lib/omp/session/mapper';
import { normalizeNoticeText } from '@/shared/lib/chat/notice-text';
import { parseChamberMarker } from '@/shared/lib/omp/mode/markers';
import { CHAMBER_MODE_EVENT } from '@/shared/lib/omp/mode/types';
import { invalidateComposerCache } from '@/shared/lib/chat/composer/client';
import { setActivity, toolHost, type OmpAgentFoldDeps } from '@/shared/lib/chat/omp/fold-deps';
import { normalizeThinkingLevel } from '@/shared/lib/models/thinking-levels';
import { PHASE_VERBS } from '@/shared/lib/chat/timeline/tool-phrases';
import { describeAssistantPhase, describeToolActivity } from '@/shared/lib/chat/timeline/tool-verbs';
import { FILE_MUTATION_EVENT, isFileMutatingTool } from '@/shared/lib/chat/omp/file-mutations';
import {
  pairToolOutputs,
  putToolResult,
  recordToolResult,
  refreshToolMessage,
  type ToolResultRecord,
} from '@/shared/lib/chat/omp/tool-results';

// Re-exported so stream.ts and the timeline hook keep their existing import
// site; the implementation lives in tool-results.ts.
export type { ToolResultRecord } from '@/shared/lib/chat/omp/tool-results';
export type { OmpAgentFoldDeps } from '@/shared/lib/chat/omp/fold-deps';

/** Flush assistant turns that stopped abnormally and were never streamed as
 *  `message_end`. A user abort is the one terminal path where omp emits no
 *  `message_end` at all — the synthetic aborted turn rides only in
 *  `agent_end.messages`. omp slices out whatever it already streamed, so any
 *  message found here is not a duplicate. Without this the failure stays
 *  invisible until the session JSONL is reloaded. */
function materializeTerminalMessages(
  data: OmpAgentEvent,
  deps: OmpAgentFoldDeps,
  callbacks: OmpAgentCallbacks | undefined,
): { errorMessage?: string } {
  if (data.isTerminal === false) return {};
  const messages = data.messages;
  if (!Array.isArray(messages)) return {};
  let errorMessage: string | undefined;
  for (const entry of messages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    if (raw.role !== 'assistant') continue;
    if (raw.stopReason !== 'aborted' && raw.stopReason !== 'error') continue;
    const converted = toChatMessage(raw, false);
    if (!converted) continue;
    const paired = pairToolOutputs(converted, deps);
    if (paired.toolCalls?.length) deps.lastToolMessageRef.current = paired;
    callbacks?.onMessageEnd?.(paired);
    if (typeof raw.errorMessage === 'string') errorMessage = raw.errorMessage;
  }
  return { errorMessage };
}

export function foldAgentEvent(data: OmpAgentEvent, deps: OmpAgentFoldDeps): void {
  const callbacks = deps.callbacksRef.current;
  switch (data.type) {
    case 'agent_start':
      deps.setState((prev) => ({ ...prev, isGenerating: true, error: null }));
      deps.toolResultsRef.current?.clear();
      deps.fileMutatingCallsRef.current?.clear();
      deps.lastToolMessageRef.current = null;
      deps.interruptPendingRef.current = false;
      // A fresh run restarts level tracking; the first turn relies on the
      // session-level value until omp emits thinking_level_changed (or not).
      deps.currentThinkingLevelRef.current = undefined;
      setActivity(PHASE_VERBS.thinking, deps);
      callbacks?.onAgentStart?.();
      break;

    case 'turn_start':
      setActivity(PHASE_VERBS.thinking, deps);
      callbacks?.onTurnStart?.();
      break;

    case 'message_start':
    case 'message_update': {
      const msg = data.message as Record<string, unknown> | undefined;
      if (!msg) break;
      if (msg.role === 'toolResult') {
        recordToolResult(msg, deps);
        setActivity(PHASE_VERBS.thinking, deps);
        break;
      }
      // Assistant phases (thinking / prose / tool-call assembly) name the
      // action directly — a tool that never starts still shows its phrase.
      setActivity(describeAssistantPhase(data.assistantMessageEvent), deps);
      // The first message frame of a turn is another proof the run is live —
      // re-signal so the sidebar can restore a lost `stream` status row.
      // message_update frames arrive per delta and must stay silent here.
      if (data.type === 'message_start') callbacks?.onTurnStart?.();
      // Steering (abort_and_prompt) and follow-up deliveries create no
      // optimistic bubble — the user turn only exists on the stream. Convert
      // it here so the bubble renders live instead of after a JSONL reload.
      // The callbacks append user rows (never overwrite the streaming AI
      // placeholder) and dedup by omp message id.
      const converted = toChatMessage(msg);
      if (converted) {
        if (converted.role !== 'user' && deps.currentThinkingLevelRef.current) {
          converted.thinkingLevel = deps.currentThinkingLevelRef.current;
        }
        callbacks?.onMessageUpdate?.(converted);
      }
      break;
    }

    case 'message_end': {
      const completed = data.message as Record<string, unknown> | undefined;
      if (!completed) break;
      if (completed.role === 'toolResult') {
        recordToolResult(completed, toolHost(deps));
        break;
      }
      if (completed.role === 'custom') break;
      if (completed.role === 'user') {
        const delivered = extractTextFromContent(completed.content);
        if (delivered) callbacks?.onQueuedMessageDelivered?.(delivered);
        break;
      }
      const converted = toChatMessage(completed, false);
      if (!converted) break;
      if (converted.role !== 'user' && deps.currentThinkingLevelRef.current) {
        converted.thinkingLevel = deps.currentThinkingLevelRef.current;
      }
      const paired = pairToolOutputs(converted, deps);
      if (paired.toolCalls?.length) deps.lastToolMessageRef.current = paired;
      callbacks?.onMessageEnd?.(paired);
      break;
    }

    case 'tool_execution_start': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
      setActivity(describeToolActivity({
        name: typeof data.toolName === 'string' ? data.toolName : undefined,
        args: data.args,
        intent: typeof data.intent === 'string' ? data.intent : undefined,
      }), deps);
      if (callId) deps.toolResultsRef.current?.set(callId, { output: '' });
      // Remember whether this call can change workspace files; the end frame
      // then signals the data panels to re-read (see file-mutations.ts).
      if (callId && isFileMutatingTool({ toolName: data.toolName, args: data.args })) {
        deps.fileMutatingCallsRef.current?.add(callId);
      }
      const last = deps.lastToolMessageRef.current;
      if (last?.toolCalls?.some(tc => tc.id === callId)) {
        deps.lastToolMessageRef.current = {
          ...last,
          toolCalls: last.toolCalls.map(tc => ({ ...tc, status: 'running' as ToolCallData['status'] })),
        };
        callbacks?.onMessageUpdate?.(deps.lastToolMessageRef.current);
      }
      break;
    }

    case 'tool_execution_update': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
      const partial = toolResultText(data.partialResult);
      if (!callId || !partial) break;
      const prev = deps.toolResultsRef.current?.get(callId)?.output ?? '';
      putToolResult(deps, callId, { output: prev + partial });
      refreshToolMessage(callId, toolHost(deps));
      break;
    }

    case 'tool_execution_end': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
      if (!callId) break;
      setActivity(PHASE_VERBS.thinking, deps);
      putToolResult(deps, callId, {
        output: toolResultText(data.result),
        isError: data.isError === true,
        details: (data.details && typeof data.details === 'object' ? data.details : undefined) as ToolResultRecord['details'],
      });
      refreshToolMessage(callId, toolHost(deps));
      // A file-mutating tool just finished — tell the data-bearing right panels
      // (files / git / context) to re-read now, not on their next poll tick.
      // Guarded: the fold also runs headless under `bun test` (no window).
      if (typeof window !== 'undefined' && deps.fileMutatingCallsRef.current?.delete(callId)) {
        window.dispatchEvent(new CustomEvent(FILE_MUTATION_EVENT, {
          detail: { sessionId: deps.sessionId },
        }));
      }
      break;
    }

    case 'agent_end': {
      // A NON-TERMINAL `agent_end` is not the end of the run: omp emits it when
      // the turn yields but work is still alive — a detached subagent, a
      // compaction, a background job, or a stop-time reminder — and a later
      // `agent_start` opens the continuation. Measured on omp 18.3.2: with an
      // async subagent, `agent_end isTerminal=false` arrives ~13s BEFORE the
      // subagent's terminal frame, and clearing the generating state there
      // blanked the indicator for the whole stretch the roster was still
      // showing a live child. The server's own fold gates on the same field
      // (frame-fold.ts), so the two ends now agree.
      if (data.isTerminal === false) break;
      deps.setState((prev) => ({ ...prev, isGenerating: false }));
      deps.activityRef.current = '';
      const terminal = materializeTerminalMessages(data, deps, callbacks ?? undefined);
      if (deps.interruptPendingRef.current) {
        deps.interruptPendingRef.current = false;
        break;
      }
      callbacks?.onAgentEnd?.({
        errorMessage: terminal.errorMessage
          ?? (typeof data.errorMessage === 'string' ? data.errorMessage : undefined),
        message: typeof data.message === 'string' ? data.message : undefined,
      });
      break;
    }

    case 'prompt_error': {
      const errorMessage = typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed';
      deps.setState((prev) => ({ ...prev, isGenerating: false, error: errorMessage }));
      deps.interruptPendingRef.current = false;
      deps.activityRef.current = '';
      callbacks?.onPromptError?.(errorMessage);
      break;
    }

    // omp's prompt ack ran a built-in slash command instead of an agent turn
    // (`agentInvoked:false`, mirrored server-side as this frame): there will be
    // no agent_start/agent_end pair. Clear the optimistic generating state —
    // the callbacks drop the AI placeholder and keep the user's message row.
    case 'prompt_result': {
      if (data.agentInvoked === false) {
        deps.setState((prev) => ({ ...prev, isGenerating: false }));
        deps.activityRef.current = '';
        callbacks?.onPromptSettled?.();
      }
      break;
    }

    // Built-in slash command output (/usage, /compact result, …). Rendered as
    // a notice row — see the callback type note: this frame is the ONLY copy.
    // `normalizeNoticeText` strips the terminal formatting omp emits here; the
    // reload path applies the same function so both agree.
    case 'command_output': {
      const text = typeof data.text === 'string' ? normalizeNoticeText(data.text) : '';
      if (text) callbacks?.onCommandOutput?.(text);
      break;
    }

    // omp renamed the session (auto-title generation, /rename, set_session_name).
    // Nothing in the timeline changes, but the sidebar reads titles from the
    // session file — and the rename is a 256-byte in-place slot write that the
    // scan cache's mtime key cannot see — so this frame is the only push
    // signal that the list is stale.
    case 'session_info_update': {
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (title) callbacks?.onSessionTitleChanged?.(title);
      break;
    }

    case 'notice': {
      callbacks?.onNotice?.(
        typeof data.level === 'string' ? data.level : 'info',
        typeof data.message === 'string' ? data.message : '',
      );
      break;
    }

    case 'extension_ui_request': {
      // The chamber's mode extension reports every plan/goal transition through
      // `ctx.ui.notify`, which omp frames as an `extension_ui_request` with
      // `method: "notify"` — NOT a `notice` frame (verified against omp 18.4.4:
      // `rpc-mode.ts`'s `notify` implementation emits exactly that).
      //
      // Those payloads are composer state, not conversation, so they are
      // intercepted here rather than handed to the dialog path: the dialog
      // renderer would paint a modal for a mode toggle. A marker whose payload
      // does not parse is NOT intercepted — it falls through as an ordinary
      // notify, so a version skew shows a readable line instead of silence.
      //
      // Delivered as a scoped window event (the shape the subagent frames use),
      // because the consumer is the composer's mode hook: routing it through
      // `callbacks` would thread a payload the timeline itself never reads
      // through four components.
      if ((data as { method?: unknown }).method === 'notify') {
        const message = typeof data.message === 'string' ? data.message : '';
        const marker = parseChamberMarker(message);
        if (marker) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(CHAMBER_MODE_EVENT, {
              detail: { sessionId: deps.sessionId, marker },
            }));
          }
          break;
        }
      }
      callbacks?.onExtensionUiRequest?.(data as unknown as IncomingExtensionUiRequest);
      break;
    }

    case 'subagent_lifecycle':
    case 'subagent_progress':
    case 'subagent_event': {
      // Forward live subagent frames to feature listeners as scoped window
      // events (same pattern as the other omp:* signals).
      const payload = data.payload;
      if (payload === undefined || payload === null || typeof payload !== 'object') break;
      window.dispatchEvent(new CustomEvent(data.type, {
        detail: { sessionId: deps.sessionId, payload },
      }));
      break;
    }

    case 'model_changed':
      callbacks?.onModelChanged?.();
      break;

    // The live `thinking_level_changed` frame carries the new session level
    // (e.g. { thinkingLevel: "high", configured, resolved }); null → "off".
    // Record it so subsequent assistant turns are stamped with the level that
    // actually served them — mirrors the JSONL `thinking_level_change` walk.
    case 'thinking_level_changed':
      deps.currentThinkingLevelRef.current = normalizeThinkingLevel(data.thinkingLevel);
      break;

    // omp emits this whenever the discovered command set changes — after
    // `/reload-plugins`, `/move`, or a skill install. The composer's command
    // pool is cached five minutes (`composer/client.ts`), so without this the
    // popup keeps offering the pre-change list.
    case 'available_commands_update':
      invalidateComposerCache('command');
      break;

    // No chamber-side effect: config frames and the transport's own `connected`
    // greeting.
    case 'config_update':
    case 'connected':
    default:
      break;
  }
}
