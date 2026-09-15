import { useState, type ReactNode } from 'react';
import { Bot, Hourglass, RotateCcw, Copy, Check, MessageSquarePlus } from 'lucide-react';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { formatDuration } from '@/lib/chat/duration';
import { providerLabel } from '@/lib/models/provider-label';

interface AiMessageFooterProps {
  provider?: string;
  providerNames?: Record<string, string>;
  currentModel: string;
  dateStr?: string;
  durationMs?: number | null;
  usage?: {
    input?: number;
    output?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cost?: { total?: number; input?: number; output?: number };
  };
  content: string;
  msgId: string;
  onRetry?: (msgId: string) => void;
  onNewChat?: (content: string) => void;
}

function formatTokens(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
}

export function AiMessageFooter({
  provider,
  providerNames,
  currentModel,
  dateStr,
  durationMs,
  usage,
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
  const totalTok = usage?.totalTokens ?? ((usage?.input ?? 0) + (usage?.output ?? 0));
  const tokensLabel = totalTok > 0 ? `${formatTokens(totalTok)} tok` : '';
  const providerText = provider ? providerLabel(provider, providerNames) : '';
  const costLabel = usage?.cost?.total && usage.cost.total > 0
    ? `$${usage.cost.total < 0.01 ? usage.cost.total.toFixed(4) : usage.cost.total.toFixed(3)}`
    : '';
  const metadataItems: Array<{ key: string; content: ReactNode; className?: string; title?: string }> = [];
  if (providerText) metadataItems.push({ key: 'provider', content: providerText });
  if (currentModel) metadataItems.push({ key: 'model', content: currentModel, className: 'font-semibold text-ink min-w-0 truncate shrink' });
  if (dateStr) metadataItems.push({ key: 'date', content: dateStr });
  if (formattedDuration) {
    metadataItems.push({
      key: 'duration',
      content: (
        <span className="text-ink/60 whitespace-nowrap flex items-center space-x-1" title={`Response time: ${formattedDuration}`}>
          <Hourglass size={11} className="text-ink/50 flex-shrink-0" />
          <span>{formattedDuration}</span>
        </span>
      ),
    });
  }
  if (tokensLabel) {
    metadataItems.push({
      key: 'tokens',
      content: tokensLabel,
      className: 'hidden sm:inline',
      title: usage?.cost?.total ? `${tokensLabel} (${costLabel})` : tokensLabel,
    });
  }
  const titleLabel = [providerText, currentModel || 'Assistant', dateStr || 'Just now', tokensLabel, costLabel]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="w-full flex items-center flex-nowrap space-x-2.5 text-[11px] text-ink/60 px-1 pt-0.5 font-mono min-w-0 animate-in fade-in duration-200">
      {/* Model and Date / Time */}
      <div
        className="flex items-center space-x-1.5 border-r border-ink/15 pr-2.5 min-w-0 shrink overflow-hidden"
        title={titleLabel}
      >
        <div className="w-4 h-4 rounded flex items-center justify-center bg-ink text-canvas shadow-2xs shrink-0">
          <Bot size={10} />
        </div>
        {metadataItems.map(({ key, content, className, title }, index) => (
          <span key={key} className={`inline-flex items-center text-ink/60 ${key === 'model' ? 'min-w-0 shrink' : 'shrink-0'} whitespace-nowrap ${className ?? ''}`} title={title}>
            {index > 0 && <span className="text-ink/40 mr-1.5">•</span>}
            {content}
          </span>
        ))}
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
