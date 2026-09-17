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

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatMessageData, ToolCallData, IncomingExtensionUiRequest, OmpAgentCallbacks, OmpAgentEvent, OmpAgentState } from '@/types';
import { extractTextFromContent, toolResultText, toChatMessage } from '@/lib/omp/session/mapper';
import { normalizeThinkingLevel } from '@/lib/models/thinking-levels';
import { PHASE_VERBS } from '@/lib/chat/timeline/tool-phrases';
import {
  describeAssistantPhase,
  describeToolActivity,
} from '@/lib/chat/timeline/tool-verbs';

/** Tool output accumulated between a `toolCall` block and its result frame. */
export interface ToolResultRecord {
  output: string;
  isError?: boolean;
  details?: Record<string, any>;
}

/** Per-entry cap on stored tool output; the tail of a build log is what matters. */
const MAX_TOOL_OUTPUT_CHARS = 200_000;
/** Max tool results retained per session; oldest entries are dropped first. */
const MAX_TRACKED_TOOL_RESULTS = 200;

/** Truncate tool output to the cap, keeping the tail and marking the cut. */
function capToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  return `…[truncated]\n${output.slice(-MAX_TOOL_OUTPUT_CHARS)}`;
}

/** Write a tool result into the map, enforcing both caps. */
function storeToolResult(
  map: Map<string, ToolResultRecord>,
  callId: string,
  record: ToolResultRecord,
): void {
  map.set(callId, { ...record, output: capToolOutput(record.output) });
  while (map.size > MAX_TRACKED_TOOL_RESULTS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export interface OmpAgentFoldDeps {
  sessionId: string;
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData | null>;
  interruptPendingRef: RefObject<boolean>;
  /** Last activity phrase published to the indicator; guards per-token frames
   *  from re-setting identical state. */
  activityRef: RefObject<string>;
  /** Thinking level in effect for the live run (last `thinking_level_changed`
   *  frame); stamped onto assistant turns as they stream. */
  currentThinkingLevelRef: RefObject<string | undefined>;
}

/** Publish a new indicator phrase, skipping repeats (thinking/text deltas
 *  arrive per token and would otherwise re-set state on every frame). */
function setActivity(verb: string | undefined, deps: OmpAgentFoldDeps): void {
  if (!verb || verb === deps.activityRef.current) return;
  deps.activityRef.current = verb;
  deps.callbacksRef.current?.onActivity?.(verb);
}

/** Re-emit the last tool-carrying assistant message with its results paired. */
function pairToolOutputs(
  msg: ChatMessageData,
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>,
): ChatMessageData {
  if (!msg.toolCalls?.length) return msg;
  const toolCalls = msg.toolCalls.map(tc => {
    const res = toolResultsRef.current?.get(tc.id);
    return res
      ? {
          ...tc,
          output: res.output,
          details: tc.details || res.details || undefined,
          status: (res.isError ? 'error' : 'success') as ToolCallData['status'],
        }
      : tc;
  });
  return { ...msg, toolCalls };
}

/** Record a toolResult frame's output against its tool call id. */
function recordToolResult(
  raw: Record<string, unknown>,
  deps: OmpAgentFoldDeps,
): void {
  const callId = typeof raw.toolCallId === 'string' ? raw.toolCallId : undefined;
  if (!callId) return;
  deps.toolResultsRef.current?.set(callId, {
    output: extractTextFromContent(raw.content),
    details: (raw.details && typeof raw.details === 'object' ? raw.details : undefined) as ToolResultRecord['details'],
  });
}

/** Re-emit the last tool-carrying message when `callId` belongs to it. */
function refreshToolMessage(callId: string | undefined, deps: OmpAgentFoldDeps): void {
  if (!callId) return;
  const last = deps.lastToolMessageRef.current;
  if (!last?.toolCalls?.some(tc => tc.id === callId)) return;
  deps.callbacksRef.current?.onMessageUpdate?.(pairToolOutputs(last, deps.toolResultsRef));
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
    const paired = pairToolOutputs(converted, deps.toolResultsRef);
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
      deps.lastToolMessageRef.current = null;
      deps.interruptPendingRef.current = false;
      // A fresh run restarts level tracking; the first turn relies on the
      // session-level value until omp emits thinking_level_changed (or not).
      deps.currentThinkingLevelRef.current = undefined;
      setActivity(PHASE_VERBS.thinking, deps);
      callbacks?.onAgentStart?.();
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
        recordToolResult(completed, deps);
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
      const paired = pairToolOutputs(converted, deps.toolResultsRef);
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
      const map = deps.toolResultsRef.current;
      if (map) storeToolResult(map, callId, { output: prev + partial });
      refreshToolMessage(callId, deps);
      break;
    }

    case 'tool_execution_end': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
      if (!callId) break;
      setActivity(PHASE_VERBS.thinking, deps);
      const map = deps.toolResultsRef.current;
      if (map) storeToolResult(map, callId, {
        output: toolResultText(data.result),
        isError: data.isError === true,
        details: (data.details && typeof data.details === 'object' ? data.details : undefined) as ToolResultRecord['details'],
      });
      refreshToolMessage(callId, deps);
      break;
    }

    case 'agent_end': {
      deps.setState((prev) => ({ ...prev, isGenerating: false }));
      deps.activityRef.current = '';
      const terminal = materializeTerminalMessages(data, deps, callbacks);
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
      // events (same pattern as omp:session-processing).
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
