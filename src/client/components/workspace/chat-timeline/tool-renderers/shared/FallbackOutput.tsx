import type { ReactNode } from 'preact/compat';
import { useMemo } from 'preact/hooks';
import { Code } from 'lucide-preact';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { sanitizeHtml } from '@/shared/lib/markdown/sanitize';
import { CopyButton } from '@/client/components/common/CopyButton';
import { stripAnsiCodes } from '@/shared/lib/code/ansi';
import { detectOutputFormat } from '@/shared/lib/chat/detect-format';
import { highlightCode, tryParseJson } from '@/shared/lib/code/syntax-highlight';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';
import { JsonCodeBlock } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/JsonCodeBlock';
import { MAX_OUTPUT_LINES, truncateTailLines } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/truncate';

interface FallbackOutputProps {
  /** Teks output mentah dari tool result. */
  text: string;
}

/** Render output fallback generik dengan deteksi format otomatis:
 *  markdown → MarkdownRenderer; html → sanitize + inject; text → syntax highlight. */
export function FallbackOutput({ text }: FallbackOutputProps) {
  const stripped = useMemo(() => stripAnsiCodes(text), [text]);
  const format = useMemo(() => detectOutputFormat(stripped), [stripped]);
  const jsonResult = useMemo(() => (format === 'json' ? tryParseJson(stripped) : null), [format, stripped]);
  const displayLinesCount = useMemo(() => {
    if (jsonResult?.isValid && jsonResult.linesCount) return jsonResult.linesCount;
    return stripped.split(/\r?\n/).length;
  }, [jsonResult, stripped]);

  const display = useMemo(() => {
    const source = format === 'json' && jsonResult?.isValid && jsonResult.pretty ? jsonResult.pretty : stripped;
    return truncateTailLines(source, MAX_OUTPUT_LINES);
  }, [format, jsonResult, stripped]);

  const isPlainText = format !== 'markdown' && format !== 'json' && format !== 'html';
  const syntaxReady = useSyntaxReady();
  const highlightedText = useMemo(
    () => (isPlainText ? highlightCode(display.text, 'javascript') : ''),
    [isPlainText, display, syntaxReady]
  );
  const copyText = useMemo(
    () => (jsonResult?.isValid && jsonResult.pretty ? jsonResult.pretty : stripped),
    [jsonResult, stripped]
  );

  let body: ReactNode;
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
        <CopyButton
          text={copyText}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
          onClick={(e) => e.stopPropagation()}
          label="Copy"
        />
      </div>
      {display.skipped > 0 && (
        <div className="font-mono text-[10px] text-ink/45">… {display.skipped} earlier lines hidden</div>
      )}
      {body}
    </div>
  );
}

