import { ChatMessageItem } from '@/components/workspace/chat-timeline/MessageItem';
import { responseRunDurationMs } from '@/lib/chat/duration';
import type { ChatMessageData } from '@/types';

export interface MessageListProps {
  messages: ChatMessageData[];
  isGenerating: boolean;
  modelName?: string;
  modelNames?: Record<string, string>;
  onUndo?: (id: string, content?: string) => void;
  onRetry?: (id: string) => void;
  onNewChat?: (content: string) => void;
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
export function MessageList({
  messages,
  isGenerating,
  modelName,
  modelNames,
  onUndo,
  onRetry,
  onNewChat,
}: MessageListProps) {
  // The streaming AI message is the last non-notice row: notice rows sit above
  // the turn, so a plain "last item" check would mark the notice as streaming
  // and render the footer early.
  let lastAiIdx = messages.length - 1;
  while (lastAiIdx >= 0 && messages[lastAiIdx].notice) lastAiIdx--;

  return (
    <>
      {messages.map((msg, idx) => {
        const prev = messages[idx - 1];
        const isLoading = isGenerating && idx === lastAiIdx && msg.role === 'ai';
        const nextReal = messages.slice(idx + 1).find(m => !m.notice);
        const isLastAi = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
        const isPrevNotice = Boolean(prev?.notice);
        const isAiFragment = msg.role !== 'user' && prev && prev.role !== 'user' && !isPrevNotice;
        let prevRealIdx = idx - 1;
        while (prevRealIdx >= 0 && messages[prevRealIdx].notice) prevRealIdx--;
        const prevReal = prevRealIdx >= 0 ? messages[prevRealIdx] : null;
        const isPrevAssistant = Boolean(msg.role !== 'user' && prevReal && prevReal.role !== 'user');
        return (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            modelName={modelName}
            modelNames={modelNames}
            isStreaming={isLoading}
            onUndo={onUndo}
            onRetry={onRetry}
            onNewChat={onNewChat}
            footerVisible={isLastAi}
            durationMs={isLastAi ? responseRunDurationMs(messages, idx) : null}
            isPrevAssistant={isPrevAssistant}
            className={msg.notice ? 'mt-3 mb-1' : isAiFragment ? 'mt-1' : 'mt-3'}
          />
        );
      })}
    </>
  );
}
