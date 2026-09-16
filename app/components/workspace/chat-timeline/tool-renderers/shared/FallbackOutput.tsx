import { useMemo, useState } from 'react';
import { Check, Copy, Code } from 'lucide-react';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { sanitizeHtml } from '@/lib/markdown/sanitize';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { detectOutputFormat } from '@/lib/chat/detect-format';
import { tryParseJson, highlightCode } from '@/lib/code/syntax-highlight';
import { JsonCodeBlock } from '@/components/workspace/chat-timeline/tool-renderers/shared/JsonCodeBlock';
import { truncateTailLines, MAX_OUTPUT_LINES } from '@/components/workspace/chat-timeline/tool-renderers/shared/truncate';

interface FallbackOutputProps {
  /** Teks output mentah dari tool result. */
  text: string;
}

/** Render output fallback generik dengan deteksi format otomatis:
 *  markdown → MarkdownRenderer; html → sanitize + inject; text → syntax highlight. */
export function FallbackOutput({ text }: FallbackOutputProps) {
  const [copied, setCopied] = useState(false);
  const format = useMemo(() => detectOutputFormat(text), [text]);
  const jsonResult = useMemo(() => (format === 'json' ? tryParseJson(text) : null), [format, text]);
  const displayLinesCount = useMemo(() => {
    if (jsonResult?.isValid && jsonResult.linesCount) return jsonResult.linesCount;
    return text.split(/\r?\n/).length;
  }, [jsonResult, text]);

  const display = useMemo(() => {
    const source = format === 'json' && jsonResult?.isValid && jsonResult.pretty ? jsonResult.pretty : text;
    return truncateTailLines(source, MAX_OUTPUT_LINES);
  }, [format, jsonResult, text]);

  const isPlainText = format !== 'markdown' && format !== 'json' && format !== 'html';
  const highlightedText = useMemo(
    () => (isPlainText ? highlightCode(display.text, 'javascript') : ''),
    [isPlainText, display]
  );

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = jsonResult?.isValid && jsonResult.pretty ? jsonResult.pretty : text;
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  let body: React.ReactNode;
  if (format === 'markdown') {
    body = (
      <div className="prose-content max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink/85 select-text">
        <MarkdownRenderer content={display.text} />
      </div>
    );
  } else if (format === 'json') {
    body = (
      <JsonCodeBlock
        jsonString={display.text}
        maxHeightClass="max-h-72"
        showHeader={false}
      />
    );
  } else if (format === 'html') {
    const sanitized = sanitizeHtml(display.text);
    body = (
      <div
        className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink/85 select-text"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  } else {
    body = (
      <pre
        className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/80 select-text"
        dangerouslySetInnerHTML={{ __html: highlightedText }}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          <Code size={11} className="text-ink/40" />
          <span>Output</span>
          <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] text-ink/45">
            {format}
          </span>
          {displayLinesCount > 1 && (
            <span className="font-mono text-[9px] text-ink/35">
              {displayLinesCount} lines
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {display.skipped > 0 && (
        <div className="font-mono text-[10px] text-ink/45">… {display.skipped} earlier lines hidden</div>
      )}
      {body}
    </div>
  );
}

