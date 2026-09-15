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

/** Tool output accumulated between a `toolCall` block and its result frame. */
export interface ToolResultRecord {
  output: string;
  isError?: boolean;
  details?: Record<string, any>;
}

export interface OmpAgentFoldDeps {
  sessionId: string;
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData | null>;
  interruptPendingRef: RefObject<boolean>;
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

export function foldAgentEvent(data: OmpAgentEvent, deps: OmpAgentFoldDeps): void {
  const callbacks = deps.callbacksRef.current;
  switch (data.type) {
    case 'agent_start':
      deps.setState((prev) => ({ ...prev, isGenerating: true, error: null }));
      deps.toolResultsRef.current?.clear();
      deps.lastToolMessageRef.current = null;
      deps.interruptPendingRef.current = false;
      callbacks?.onAgentStart?.();
      break;

    case 'message_start':
    case 'message_update': {
      const msg = data.message as Record<string, unknown> | undefined;
      if (!msg) break;
      if (msg.role === 'toolResult') {
        recordToolResult(msg, deps);
        break;
      }
      // Steering (abort_and_prompt) and follow-up deliveries create no
      // optimistic bubble — the user turn only exists on the stream. Convert
      // it here so the bubble renders live instead of after a JSONL reload.
      // The callbacks append user rows (never overwrite the streaming AI
      // placeholder) and dedup by omp message id.
      const converted = toChatMessage(msg);
      if (converted) callbacks?.onMessageUpdate?.(converted);
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
      const paired = pairToolOutputs(converted, deps.toolResultsRef);
      if (paired.toolCalls?.length) deps.lastToolMessageRef.current = paired;
      callbacks?.onMessageEnd?.(paired);
      break;
    }

    case 'tool_execution_start': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
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
      deps.toolResultsRef.current?.set(callId, { output: prev + partial });
      refreshToolMessage(callId, deps);
      break;
    }

    case 'tool_execution_end': {
      const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
      if (!callId) break;
      deps.toolResultsRef.current?.set(callId, {
        output: toolResultText(data.result),
        isError: data.isError === true,
        details: (data.details && typeof data.details === 'object' ? data.details : undefined) as ToolResultRecord['details'],
      });
      refreshToolMessage(callId, deps);
      break;
    }

    case 'agent_end': {
      deps.setState((prev) => ({ ...prev, isGenerating: false }));
      if (deps.interruptPendingRef.current) {
        deps.interruptPendingRef.current = false;
        break;
      }
      callbacks?.onAgentEnd?.({
        errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
        message: typeof data.message === 'string' ? data.message : undefined,
      });
      break;
    }

    case 'prompt_error': {
      const errorMessage = typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed';
      deps.setState((prev) => ({ ...prev, isGenerating: false, error: errorMessage }));
      deps.interruptPendingRef.current = false;
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

    // No chamber-side effect: thinking/config/command inventory frames and the
    // transport's own `connected` greeting.
    case 'thinking_level_changed':
    case 'config_update':
    case 'available_commands_update':
    case 'connected':
    default:
      break;
  }
}
