/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SSE stream wiring for the live omp agent bridge. Owns the EventSource
 * lifecycle and folds omp event frames into the chamber ChatMessageData shape
 * via message-mapper, mutating the shared accumulation refs and dispatching
 * to the caller's callback refs. Kept out of useOmpAgent so that hook only
 * owns RPC command sends + agent state.
 */

import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatMessageData, ToolCallData } from '@/types';
import type { IncomingExtensionUiRequest } from '@/types/omp/agent';
import type { OmpAgentCallbacks, OmpAgentEvent, OmpAgentState } from '@/hooks/chat/omp';
import { extractTextFromContent, toolResultText, toChatMessage } from '@/lib/omp/session/mapper';

interface ToolResultRecord {
  output: string;
  isError?: boolean;
  details?: Record<string, any>;
}

export interface OmpStreamRefs {
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData | null>;
  interruptPendingRef: RefObject<boolean>;
}

interface UseOmpAgentStreamOptions extends OmpStreamRefs {
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
}

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

export function useOmpAgentStream({
  setState,
  callbacksRef,
  toolResultsRef,
  lastToolMessageRef,
  interruptPendingRef,
}: UseOmpAgentStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    const es = eventSourceRef.current;
    eventSourceRef.current = null;
    if (es) {
      es.onopen = null;
      es.onmessage = null;
      es.onerror = null;
      es.close();
    }
    setState((prev) => ({ ...prev, connected: false }));
  }, [setState]);

  const connect = useCallback((sid: string) => {
    disconnect();
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;
    es.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
      callbacksRef.current?.onConnected?.();
    };
    es.onmessage = (e) => {
      let data: OmpAgentEvent;
      try {
        data = JSON.parse(e.data) as OmpAgentEvent;
      } catch {
        return;
      }
      switch (data.type) {
        case 'agent_start':
          setState((prev) => ({ ...prev, isGenerating: true, error: null }));
          toolResultsRef.current?.clear();
          lastToolMessageRef.current = null;
          interruptPendingRef.current = false;
          callbacksRef.current?.onAgentStart?.();
          break;
        case 'message_start':
        case 'message_update': {
          const msg = data.message as Record<string, unknown> | undefined;
          if (!msg) break;
          if (msg.role === 'toolResult') {
            const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
            const text = extractTextFromContent(msg.content);
            const details = (msg.details && typeof msg.details === 'object' ? msg.details : undefined) as Record<string, any> | undefined;
            if (callId) {
              toolResultsRef.current?.set(callId, { output: text, details });
            }
            break;
          }
          if (msg.role !== 'user') {
            const converted = toChatMessage(msg);
            if (converted) callbacksRef.current?.onMessageUpdate?.(converted);
          } else {
            // Steering (abort_and_prompt) and follow-up deliveries create no
            // optimistic bubble — the user turn only exists on the stream.
            // Convert it here so the bubble renders live instead of after a
            // JSONL reload. The callbacks append user rows (never overwrite
            // the streaming AI placeholder) and dedup by omp message id.
            const converted = toChatMessage(msg);
            if (converted) callbacksRef.current?.onMessageUpdate?.(converted);
          }
          break;
        }
        case 'message_end': {
          const completed = data.message as Record<string, unknown> | undefined;
          if (!completed) break;
          if (completed.role === 'toolResult') {
            const callId = typeof completed.toolCallId === 'string' ? completed.toolCallId : undefined;
            const text = extractTextFromContent(completed.content);
            const details = (completed.details && typeof completed.details === 'object' ? completed.details : undefined) as Record<string, any> | undefined;
            if (callId) {
              toolResultsRef.current?.set(callId, { output: text, details });
            }
            break;
          }
          if (completed.role === 'custom') break;
          if (completed.role === 'user') {
            const delivered = extractTextFromContent(completed.content);
            if (delivered) callbacksRef.current?.onQueuedMessageDelivered?.(delivered);
            break;
          }
          if (completed.role !== 'toolResult' && completed.role !== 'user') {
            const converted = toChatMessage(completed, false);
            if (converted) {
              const paired = pairToolOutputs(converted, toolResultsRef);
              if (paired.toolCalls?.length) lastToolMessageRef.current = paired;
              callbacksRef.current?.onMessageEnd?.(paired);
            }
          }
          break;
        }
        case 'tool_execution_start': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          if (callId) toolResultsRef.current?.set(callId, { output: '' });
          if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
            lastToolMessageRef.current = { ...lastToolMessageRef.current, toolCalls: lastToolMessageRef.current.toolCalls.map(tc => ({ ...tc, status: 'running' as ToolCallData['status'] })) };
            callbacksRef.current?.onMessageUpdate?.(lastToolMessageRef.current);
          }
          break;
        }
        case 'tool_execution_update': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          const partial = toolResultText(data.partialResult);
          if (callId && partial) {
            const prev = toolResultsRef.current?.get(callId)?.output ?? '';
            toolResultsRef.current?.set(callId, { output: prev + partial });
            if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
              callbacksRef.current?.onMessageUpdate?.(pairToolOutputs(lastToolMessageRef.current, toolResultsRef));
            }
          }
          break;
        }
        case 'tool_execution_end': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          const result = toolResultText(data.result);
          const isError = data.isError === true;
          const details = (data.details && typeof data.details === 'object' ? data.details : undefined) as Record<string, any> | undefined;
          if (callId) {
            toolResultsRef.current?.set(callId, { output: result, isError, details });
            if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
              callbacksRef.current?.onMessageUpdate?.(pairToolOutputs(lastToolMessageRef.current, toolResultsRef));
            }
          }
          break;
        }
        case 'agent_end': {
          setState((prev) => ({ ...prev, isGenerating: false }));
          if (interruptPendingRef.current) {
            interruptPendingRef.current = false;
            break;
          }
          callbacksRef.current?.onAgentEnd?.({
            errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
            message: typeof data.message === 'string' ? data.message : undefined,
          });
          break;
        }
        case 'prompt_error': {
          setState((prev) => ({ ...prev, isGenerating: false, error: typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed' }));
          interruptPendingRef.current = false;
          callbacksRef.current?.onPromptError?.(typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed');
          break;
        }
        case 'notice': {
          callbacksRef.current?.onNotice?.(
            typeof data.level === 'string' ? data.level : 'info',
            typeof data.message === 'string' ? data.message : '',
          );
          break;
        }
        case 'extension_ui_request': {
          callbacksRef.current?.onExtensionUiRequest?.(data as unknown as IncomingExtensionUiRequest);
          break;
        }
        case 'subagent_lifecycle':
        case 'subagent_progress':
        case 'subagent_event': {
          // Forward live subagent frames to feature listeners as scoped window
          // events (same pattern as omp:session-processing). The frames already
          // flow through the SSE bridge; here they were simply dropped.
          const payload = data.payload;
          if (payload !== undefined && payload !== null && typeof payload === 'object') {
            window.dispatchEvent(new CustomEvent(data.type, {
              detail: { sessionId: sid, payload },
            }));
          }
          break;
        }
        case 'thinking_level_changed':
        case 'model_changed':
        case 'config_update':
        case 'available_commands_update':
        case 'connected':
          break;
        default:
          break;
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setState((prev) => ({ ...prev, connected: false }));
      }
    };
  }, [disconnect, setState, callbacksRef, toolResultsRef, lastToolMessageRef, interruptPendingRef]);

  return { connect, disconnect };
}

export type { ToolResultRecord };
