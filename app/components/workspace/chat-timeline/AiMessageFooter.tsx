import { useState } from 'react';
import { Bot, Hourglass, RotateCcw, Copy, Check, MessageSquarePlus } from 'lucide-react';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { formatDuration } from '@/lib/chat/duration';

interface AiMessageFooterProps {
  currentModel: string;
  dateStr?: string;
  durationMs?: number | null;
  content: string;
  msgId: string;
  onRetry?: (msgId: string) => void;
  onNewChat?: (content: string) => void;
}

export function AiMessageFooter({
  currentModel,
  dateStr,
  durationMs,
  content,
  msgId,
  onRetry,
  onNewChat,
}: AiMessageFooterProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (content) {
      copyToClipboard(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRetry = () => {
    onRetry?.(msgId);
  };

  const handleNewChat = () => {
    onNewChat?.(content);
  };

  const formattedDuration = formatDuration(durationMs ?? 0);

  return (
    <div className="w-full flex items-center flex-nowrap space-x-2.5 text-[11px] text-ink/60 px-1 pt-0.5 font-mono min-w-0 animate-in fade-in duration-200">
      {/* Model and Date / Time */}
      <div
        className="flex items-center space-x-1.5 border-r border-ink/15 pr-2.5 min-w-0 shrink overflow-hidden"
        title={`${currentModel} • ${dateStr || 'Just now'}`}
      >
        <div className="w-4 h-4 rounded flex items-center justify-center bg-ink text-canvas shadow-2xs shrink-0">
          <Bot size={10} />
        </div>
        <span className="font-semibold text-ink truncate shrink">
          {currentModel}
        </span>
        <span className="text-ink/40 shrink-0">•</span>
        {dateStr && (
          <span className="text-ink/60 shrink-0 whitespace-nowrap">{dateStr}</span>
        )}
        {formattedDuration && (
          <>
            <span className="text-ink/40 shrink-0">•</span>
            <span
              className="text-ink/60 shrink-0 whitespace-nowrap flex items-center space-x-1"
              title={`Response time: ${formattedDuration}`}
            >
              <Hourglass size={11} className="text-ink/50 flex-shrink-0" />
              <span>{formattedDuration}</span>
            </span>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-1 shrink-0">
        <button
          type="button"
          className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer"
          title="Re-run / Retry generation"
          onClick={handleRetry}
        >
          <RotateCcw size={12} />
        </button>

        <button
          type="button"
          className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer"
          title="Copy response"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        </button>

        <button
          type="button"
          className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer"
          title="New Chat from here"
          onClick={handleNewChat}
        >
          <MessageSquarePlus size={12} />
        </button>
      </div>
    </div>
  );
}
