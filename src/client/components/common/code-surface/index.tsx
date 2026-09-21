import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties } from 'preact';
import { CodeEditor } from '@/client/components/common/code-editor';
import { measureWrappedLines, type WrappedLines } from '@/client/components/common/code-surface/measure';
import { highlightCode } from '@/shared/lib/code/syntax-highlight';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';

const WRAP_ON = '!whitespace-pre-wrap !break-words';
const WRAP_OFF = '!whitespace-pre !break-normal';

interface CodeSurfaceProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Shiki language id, already resolved from the file name. */
  language: string;
  wordWrap: boolean;
  /** Outer flex row that holds the gutter and the editor column. */
  rootClassName?: string;
  gutterClassName?: string;
  gutterStyle?: CSSProperties;
  /** Class on each gutter line number. */
  gutterLineClassName?: string;
  /** Column wrapping the CodeEditor (padding/overflow live here). */
  editorWrapperClassName?: string;
  editorClassName?: string;
  editorPadding?: number;
  editorStyle?: CSSProperties;
}

/** Same measurement, so a re-render does not resize every gutter row. */
function sameWrappedLines(previous: WrappedLines | null, next: WrappedLines | null): boolean {
  if (previous === next) return true;
  if (!previous || !next || previous.rowHeight !== next.rowHeight) return false;
  return (
    previous.heights.length === next.heights.length &&
    previous.heights.every((height, index) => height === next.heights[index])
  );
}

/**
 * The line-number gutter + syntax-highlighted editing surface shared by the
 * desktop editor and the phone's full-screen editor. Callers own only the
 * layout classes (padding, font, zoom) that genuinely differ per layout; the
 * gutter, word-wrap behaviour and Shiki highlighting live here so the two
 * surfaces cannot drift.
 *
 * The gutter spaces its numbers from the editor's measured wrap layout: with
 * word wrap on, a long line covers several rows and every number below it has
 * to move down by the same amount.
 */
export function CodeSurface({
  value,
  onValueChange,
  language,
  wordWrap,
  rootClassName,
  gutterClassName,
  gutterStyle,
  gutterLineClassName,
  editorWrapperClassName,
  editorClassName,
  editorPadding = 0,
  editorStyle,
}: CodeSurfaceProps) {
  const wrapClass = wordWrap ? WRAP_ON : WRAP_OFF;
  const preRef = useRef<HTMLPreElement | null>(null);
  const [wrapped, setWrapped] = useState<WrappedLines | null>(null);
  useSyntaxReady();

  // Re-measured on the inputs that move a wrap point: the text, the wrap
  // preference, and the editor's font size / padding.
  const measure = useCallback(() => {
    const pre = preRef.current;
    const next = wordWrap && pre ? measureWrappedLines(pre, value) : null;
    setWrapped((previous) => (sameWrappedLines(previous, next) ? previous : next));
  }, [value, wordWrap, editorPadding, editorStyle?.fontSize]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // The wrap width also changes without a re-render — dragging the panel
  // splitter, resizing the window, a zoom that reflows — so the editor's own
  // box drives a re-measure too.
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    const pre = preRef.current;
    if (!pre || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(pre);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={rootClassName}>
      <div className={gutterClassName} style={gutterStyle}>
        {value.split('\n').map((_, i) => (
          <div
            key={i + 1}
            className={gutterLineClassName}
            style={wrapped ? { height: wrapped.heights[i], flexShrink: 0 } : undefined}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className={editorWrapperClassName}>
        <CodeEditor
          value={value}
          onValueChange={onValueChange}
          highlight={(code) => highlightCode(code, language)}
          padding={editorPadding}
          preRef={preRef}
          textareaClassName={`focus:outline-none ${wrapClass}`}
          preClassName={wrapClass}
          style={editorStyle}
          className={editorClassName}
        />
      </div>
    </div>
  );
}
