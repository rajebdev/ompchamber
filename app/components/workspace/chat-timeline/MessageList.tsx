import { memo, useMemo } from 'react';

import { ChatMessageItem } from '@/components/workspace/chat-timeline/MessageItem';
import { responseRunDurationMs } from '@/lib/chat/duration';
import type { ChatMessageData } from '@/types';

export interface MessageListProps {
  messages: ChatMessageData[];
  isGenerating: boolean;
  provider?: string;
  providerNames?: Record<string, string>;
  modelName?: string;
  modelNames?: Record<string, string>;
  onUndo?: (id: string, content?: string) => void;
  onRetry?: (id: string) => void;
  onNewChat?: (content: string) => void;
  isMobile?: boolean;
}

/**
 * Shared timeline body: the ordered message rows plus the per-run footer
 * (model + duration) ownership rules. Desktop and mobile render the exact same
 * rows — only the surrounding scroll container differs.
 *
 * Footer ownership: notice rows are transparent for footer purposes, so the
 * last real AI message of a run still owns the footer even when a notice row
 * follows it, and the notice itself never gets one.
 */
// Per-row lookups (next/prev non-notice neighbour, run durations) are built in
// one O(n) pass and memoized on `messages`, so a streaming frame renders in
// O(n) instead of re-scanning the array for every row. `memo` then skips the
// rows entirely when the props are referentially unchanged.
export const MessageList = memo(function MessageList({
  messages,
  isGenerating,
  provider,
  providerNames,
  modelName,
  modelNames,
  onUndo,
  onRetry,
  onNewChat,
  isMobile = false,
}: MessageListProps) {
  const { lastAiIdx, nextNonNotice, prevNonNoticeIdx, durations } = useMemo(() => {
    const count = messages.length;

    // The streaming AI message is the last non-notice row: notice rows sit above
    // the turn, so a plain "last item" check would mark the notice as streaming
    // and render the footer early.
    let lastAi = count - 1;
    while (lastAi >= 0 && messages[lastAi].notice) lastAi--;

    // nextNonNotice[idx]: nearest non-notice row strictly AFTER idx (or null).
    const nextNonNotice: (ChatMessageData | null)[] = new Array(count);
    let next: ChatMessageData | null = null;
    for (let i = count - 1; i >= 0; i--) {
      nextNonNotice[i] = next;
      if (!messages[i].notice) next = messages[i];
    }

    // prevNonNoticeIdx[idx]: nearest non-notice row index strictly BEFORE idx.
    const prevNonNoticeIdx: number[] = new Array(count);
    let prevIdx = -1;
    for (let i = 0; i < count; i++) {
      prevNonNoticeIdx[i] = prevIdx;
      if (!messages[i].notice) prevIdx = i;
    }

    // Footer-owning rows resolve their run duration once here (each is O(n) in
    // the worst case, so doing it inline would be O(n²) overall).
    const durations: (number | null)[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const msg = messages[i];
      const nextReal = nextNonNotice[i];
      const ownsFooter = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
      durations[i] = ownsFooter ? responseRunDurationMs(messages, i) : null;
    }

    return { lastAiIdx: lastAi, nextNonNotice, prevNonNoticeIdx, durations };
  }, [messages]);

  return (
    <>
      {messages.map((msg, idx) => {
        const prev = messages[idx - 1];
        const isLoading = isGenerating && idx === lastAiIdx && msg.role === 'ai';
        const nextReal = nextNonNotice[idx];
        const isLastAi = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
        const isPrevNotice = Boolean(prev?.notice);
        const isAiFragment = msg.role !== 'user' && prev && prev.role !== 'user' && !isPrevNotice;
        const prevRealIdx = prevNonNoticeIdx[idx];
        const prevReal = prevRealIdx >= 0 ? messages[prevRealIdx] : null;
        const isPrevAssistant = Boolean(msg.role !== 'user' && prevReal && prevReal.role !== 'user');
        return (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            provider={provider}
            providerNames={providerNames}
            modelName={modelName}
            modelNames={modelNames}
            isStreaming={isLoading}
            onUndo={onUndo}
            onRetry={onRetry}
            onNewChat={onNewChat}
            footerVisible={isLastAi}
            durationMs={durations[idx]}
            isPrevAssistant={isPrevAssistant}
            isMobile={isMobile}
            className={msg.notice ? 'mt-3 mb-1' : isAiFragment ? 'mt-1' : 'mt-3'}
          />
        );
      })}
    </>
  );
});
