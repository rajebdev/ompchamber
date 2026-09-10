/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds the SSE stream-chunk callback object passed to streamChatResponse for
 * the mock / chamber-created session path in useChatTimeline. Extracted so the
 * timeline hook stays under the repo's per-file size ceiling. Closures mutate
 * the caller's state, so they arrive via a single deps record and are read as
 * `deps.*` — captured semantics are unchanged.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageData } from '@/types';
import type { StreamChunkCallbacks } from '@/hooks/chat/stream';
import { triggerChatCompletionSound } from '@/hooks/ui/notification-sound';

export interface MockStreamCallbacksDeps {
  aiPlaceholderId: string;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  persistMessages: (messages: any[]) => void;
  setGenerating: (v: boolean) => void;
  abortControllerRef: { current: AbortController | null };
  appSettings: Record<string, any>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function createMockStreamCallbacks(deps: MockStreamCallbacksDeps): StreamChunkCallbacks {
  const {
    aiPlaceholderId,
    setLocalMessages,
    persistMessages,
    setGenerating,
    abortControllerRef,
    appSettings,
    scrollToBottom,
  } = deps;

  return {
    onInit: (data) => {
      setLocalMessages(prev =>
        prev.map(m => (m.id === aiPlaceholderId ? { ...m, id: data.id, date: data.date } : m))
      );
    },
    onThinkingStart: () => {
      setLocalMessages(prev =>
        prev.map(m =>
          m.id === aiPlaceholderId || m.role === 'ai'
            ? { ...m, thinking: { thought: '', isGenerating: true } }
            : m
        )
      );
      setTimeout(() => scrollToBottom('smooth'), 50);
    },
    onThinkingChunk: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            const currentThought = typeof m.thinking === 'object' ? m.thinking.thought || '' : '';
            return {
              ...m,
              thinking: { thought: currentThought + data.delta, isGenerating: true },
            };
          }
          return m;
        })
      );
      scrollToBottom('smooth');
    },
    onThinkingEnd: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return {
              ...m,
              thinking: {
                thought: data.thought,
                summary: data.summary,
                duration: data.duration,
                isGenerating: false,
              },
            };
          }
          return m;
        })
      );
    },
    onToolStart: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return {
              ...m,
              toolCalls: [...(m.toolCalls || []), data],
            };
          }
          return m;
        })
      );
      setTimeout(() => scrollToBottom('smooth'), 50);
    },
    onToolOutputChunk: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return {
              ...m,
              toolCalls: (m.toolCalls || []).map(t =>
                t.id === data.id ? { ...t, output: (t.output || '') + data.delta } : t
              ),
            };
          }
          return m;
        })
      );
      scrollToBottom('smooth');
    },
    onToolEnd: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return {
              ...m,
              toolCalls: (m.toolCalls || []).map(t => (t.id === data.id ? { ...t, ...data } : t)),
            };
          }
          return m;
        })
      );
    },
    onContentChunk: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return {
              ...m,
              content: (m.content || '') + data.delta,
            };
          }
          return m;
        })
      );
      scrollToBottom('smooth');
    },
    onSummary: (data) => {
      setLocalMessages(prev =>
        prev.map(m => {
          if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
            return { ...m, summary: data.summary };
          }
          return m;
        })
      );
    },
    onDone: (data) => {
      setLocalMessages(prev => {
        const updated = prev.map(m =>
          m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)
            ? data.message
            : m
        );
        persistMessages(updated);
        return updated;
      });
      setGenerating(false);
      abortControllerRef.current = null;
      triggerChatCompletionSound(appSettings);
      setTimeout(() => scrollToBottom('smooth'), 50);
    },
    onError: () => {
      setGenerating(false);
      abortControllerRef.current = null;
    },
  };
}
