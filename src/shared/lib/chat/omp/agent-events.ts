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

import type { Dispatch, RefObject, SetStateAction } from 'preact/compat';
import type { ChatMessageData, IncomingExtensionUiRequest, OmpAgentCallbacks, OmpAgentEvent, OmpAgentState, ToolCallData } from '@/shared/types';
import { extractTextFromContent, toChatMessage, toolResultText } from '@/shared/lib/omp/session/mapper';
import { normalizeThinkingLevel } from '@/shared/lib/models/thinking-levels';
import { PHASE_VERBS } from '@/shared/lib/chat/timeline/tool-phrases';
import { describeAssistantPhase, describeToolActivity } from '@/shared/lib/chat/timeline/tool-verbs';
import { FILE_MUTATION_EVENT, isFileMutatingTool } from '@/shared/lib/chat/omp/file-mutations';
import {
  pairToolOutputs,
  putToolResult,
  recordToolResult,
  refreshToolMessage,
  type ToolResultHost,
  type ToolResultRecord,
} from '@/shared/lib/chat/omp/tool-results';

// Re-exported so stream.ts and the timeline hook keep their existing import
// site; the implementation lives in tool-results.ts.
export type { ToolResultRecord } from '@/shared/lib/chat/omp/tool-results';

export interface OmpAgentFoldDeps extends ToolResultHost {
  sessionId: string;
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData>;
  interruptPendingRef: RefObject<boolean>;
  /** Last activity phrase published to the indicator; guards per-token frames
   *  from re-setting identical state. */
  activityRef: RefObject<string>;
  /** Thinking level in effect for the live run (last `thinking_level_changed`
   *  frame); stamped onto assistant turns as they stream. */
  currentThinkingLevelRef: RefObject<string | undefined>;
  /** toolCallIds of in-flight file-mutating calls, cleared on `agent_start`. */
  fileMutatingCallsRef: RefObject<Set<string>>;
}

/** Publish a new indicator phrase, skipping repeats (thinking/text deltas
 *  arrive per token and would otherwise re-set state on every frame). */
function setActivity(verb: string | undefined, deps: OmpAgentFoldDeps): void {
  if (!verb || verb === deps.activityRef.current) return;
  deps.activityRef.current = verb;
  deps.callbacksRef.current?.onActivity?.(verb);
}

/** Narrow a deps record to the tool-output host, adding the re-emit sink. */
function toolHost(deps: OmpAgentFoldDeps): ToolResultHost {
  return { ...deps, onMessageUpdate: deps.callbacksRef.current?.onMessageUpdate };
}

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
    case 'command_output': {
      const text = typeof data.text === 'string' ? data.text.trim() : '';
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

    // No chamber-side effect: config/command inventory frames and the
    // transport's own `connected` greeting.
    case 'config_update':
    case 'available_commands_update':
    case 'connected':
    default:
      break;
  }
}
