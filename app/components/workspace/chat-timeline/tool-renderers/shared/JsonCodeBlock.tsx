import { useState, useMemo } from 'react';
import { Check, Copy, Braces } from 'lucide-react';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { highlightJson } from '@/lib/code/syntax-highlight';

interface JsonCodeBlockProps {
  /** Formatted JSON string to render */
  jsonString: string;
  /** Optional title to show in the header */
  title?: string;
  /** Custom max-height class (default: max-h-56, or max-h-40 if compact) */
  maxHeightClass?: string;
  /** Whether to show header bar (default: true) */
  showHeader?: boolean;
  /** Custom root className */
  className?: string;
  /** Optional compact styling mode */
  compact?: boolean;
  /** Optional custom header icon */
  icon?: React.ReactNode;
}

export function JsonCodeBlock({
  jsonString,
  title,
  maxHeightClass,
  showHeader = true,
  className = '',
  compact = false,
  icon,
}: JsonCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const effectiveMaxHeight = maxHeightClass || (compact ? 'max-h-40' : 'max-h-56');
  const lines = useMemo(() => jsonString.split('\n'), [jsonString]);
  const highlighted = useMemo(() => highlightJson(jsonString), [jsonString]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(jsonString);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`overflow-hidden ${compact ? 'rounded-md' : 'rounded-lg'} border border-ink/8 bg-paper ${className}`}>
      {showHeader && (
        <div className={`flex items-center justify-between border-b border-ink/6 bg-canvas/40 ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {icon || <Braces size={compact ? 10.5 : 11} className="text-ink/60 shrink-0" />}
            <span className={`font-mono ${compact ? 'text-[10px]' : 'text-[10.5px]'} font-semibold text-ink truncate`}>
              {title || 'JSON'}
            </span>
            <span className={`rounded bg-ink/5 px-1.5 py-0.2 font-mono ${compact ? 'text-[8.5px]' : 'text-[9px]'} uppercase tracking-wider text-ink/50 shrink-0`}>
              JSON
            </span>
            <span className={`font-mono ${compact ? 'text-[9px]' : 'text-[9.5px]'} text-ink/40 shrink-0`}>
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink shrink-0"
            title="Copy JSON"
          >
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className={`flex ${effectiveMaxHeight} items-start overflow-x-auto font-mono ${compact ? 'text-[10.5px] leading-snug' : 'text-[11px] leading-relaxed'} select-text`}>
        <div className={`sticky left-0 flex-shrink-0 select-none border-r border-ink/6 bg-canvas/50 ${compact ? 'py-1.5 pl-2 pr-1.5 text-[9.5px]' : 'py-2 pl-2.5 pr-2 text-[10px]'} text-right text-ink/25`}>
          {lines.map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
        <pre
          className={`flex-1 overflow-x-auto ${compact ? 'p-1.5' : 'p-2'} whitespace-pre text-ink/85 font-mono`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    </div>
  );
}
