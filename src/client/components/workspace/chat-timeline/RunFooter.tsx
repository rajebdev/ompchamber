import type { ChatMessageData } from '@/shared/types';
import { AiMessageFooter } from '@/client/components/workspace/chat-timeline/AiMessageFooter';
import { messageAnswerText } from '@/shared/lib/chat/notice-row';
import { formatMessageStamp } from '@/shared/lib/format/time';

interface RunFooterProps {
  /** The run's last real AI message (`RunFooterSlot.msg`). */
  msg: ChatMessageData;
  /** Session-level provider, used when the turn recorded none. */
  provider?: string;
  providerNames?: Record<string, string>;
  modelName?: string;
  /** id → display-name map from the model catalog. */
  modelNames?: Record<string, string>;
  /** Session thinking level, used when the turn recorded none. */
  thinkingLevel?: string;
  durationMs?: number | null;
  onRetry?: (msgId: string) => void;
  onNewChat?: (content: string) => void;
  /** Mobile uses a compact provider/model footer with a bottom-sheet menu. */
  isMobile?: boolean;
}

/**
 * Boundary footer of an AI response run: the timeline renders it as the run's
 * own row — after every row the run owns, immediately before the next user
 * message — never inside the answer bubble. The slot's AI message supplies the
 * turn's model/usage/content.
 */
export function RunFooter({
  msg,
  provider,
  providerNames,
  modelName,
  modelNames,
  thinkingLevel,
  durationMs,
  onRetry,
  onNewChat,
  isMobile = false,
}: RunFooterProps) {
  return (
    <div className="mt-2">
      <AiMessageFooter
        provider={msg.provider || provider}
        providerNames={providerNames}
        currentModel={(msg.model ? (modelNames?.[msg.model] ?? msg.model) : '') || modelName || ''}
        thinkingLevel={msg.thinkingLevel ?? thinkingLevel}
        dateStr={formatMessageStamp(msg)}
        durationMs={durationMs ?? msg.durationMs}
        usage={msg.usage}
        content={messageAnswerText(msg)}
        msgId={msg.id}
        onRetry={onRetry}
        onNewChat={onNewChat}
        isMobile={isMobile}
      />
    </div>
  );
}
