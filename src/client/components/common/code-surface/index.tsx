import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CSSProperties } from 'preact';

import { CodeEditor } from '@/client/components/common/code-editor';
import { measureRowHeight, measureWrappedLines, type WrappedLines } from '@/client/components/common/code-surface/measure';
import { useCodeWindow } from '@/client/hooks/editor/use-code-window';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';
import {
  measuredGeometry,
  shouldWindow,
  uniformGeometry,
  type LineGeometry,
  type LineWindow,
} from '@/shared/lib/code/lazy-window';
import { highlightCode } from '@/shared/lib/code/syntax-highlight';
import { highlightCodeWindow } from '@/shared/lib/code/windowed-highlight';

const WRAP_ON = '!whitespace-pre-wrap !break-words';
const WRAP_OFF = '!whitespace-pre !break-normal';

/** Line count without materializing every line — a 20 000-line value per render is a megabyte of strings. */
function countLines(text: string): number {
  let count = 1;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) count++;
  return count;
}

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
 *
 * A long document is drawn lazily: only the lines inside the scroll container's
 * viewport are highlighted and numbered, and the space of everything else is
 * reserved from the same geometry the caret is aligned to. That keeps opening a
 * 20 000-line file from spending minutes in the tokenizer, and a keystroke in it
 * from re-tokenizing the file at all.
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [wrapped, setWrapped] = useState<WrappedLines | null>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  /** Lines the last measurement pass described; -1 before the first one runs. */
  const [measuredLines, setMeasuredLines] = useState(-1);
  useSyntaxReady();

  const lineCount = useMemo(() => countLines(value), [value]);

  // Re-measured on the inputs that move a wrap point: the text, the wrap
  // preference, and the editor's font size / padding.
  const measure = useCallback(() => {
    const pre = preRef.current;
    if (!pre) return;
    // Wrapped heights are only needed with word wrap on; without it every line
    // is one row and the row height alone describes the document.
    const next = wordWrap ? measureWrappedLines(pre, value) : null;
    setWrapped((previous) => (sameWrappedLines(previous, next) ? previous : next));
    const height = next?.rowHeight ?? measureRowHeight(pre);
    setRowHeight((previous) => (previous === height ? previous : height));
    setMeasuredLines(lineCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lineCount, wordWrap, editorPadding, editorStyle?.fontSize]);

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

  const geometry = useMemo<LineGeometry | null>(() => {
    if (rowHeight === null) return null;
    return wrapped
      ? measuredGeometry(wrapped.heights, wrapped.rowHeight, lineCount)
      : uniformGeometry(rowHeight, lineCount);
  }, [rowHeight, wrapped, lineCount]);

  // Windowing costs a scroll listener and a spacer; a document short enough to
  // draw in one pass keeps the plain surface.
  const lazy = shouldWindow(lineCount, value.length);
  const virtual = useCodeWindow({
    rootRef,
    lineCount,
    geometry,
    // A document whose geometry could not be measured still falls back to the
    // plain surface — but one whose measurement has not run *yet* must not:
    // that path would draw the whole file, which is what windowing exists to
    // avoid. `measuredLines` is why switching files (which leaves a geometry
    // for the previous document behind) does not take it either.
    enabled: lazy && (measuredLines !== lineCount || geometry !== null),
  });

  const highlight = useCallback(
    (code: string, range: LineWindow | null) =>
      range ? highlightCodeWindow(code, language, range) : highlightCode(code, language),
    [language],
  );

  const firstLine = virtual ? virtual.start : 0;
  const lastLine = virtual ? Math.min(virtual.end, lineCount) : lineCount;
  const rows: number[] = [];
  for (let i = firstLine; i < lastLine; i++) rows.push(i);
  // Row heights are only usable for the document they were measured against.
  const lineHeights = wrapped && wrapped.heights.length === lineCount ? wrapped.heights : null;

  return (
    <div className={rootClassName} ref={rootRef}>
      <div className={gutterClassName} style={gutterStyle}>
        {virtual && virtual.top > 0 ? <div style={{ height: virtual.top, flexShrink: 0 }} aria-hidden="true" /> : null}
        {rows.map((index) => (
          <div
            key={index + 1}
            className={gutterLineClassName}
            style={lineHeights ? { height: lineHeights[index], flexShrink: 0 } : undefined}
          >
            {index + 1}
          </div>
        ))}
      </div>
      <div className={editorWrapperClassName}>
        <CodeEditor
          value={value}
          onValueChange={onValueChange}
          highlight={highlight}
          padding={editorPadding}
          preRef={preRef}
          textareaClassName={`focus:outline-none ${wrapClass}`}
          preClassName={wrapClass}
          style={editorStyle}
          className={editorClassName}
          virtual={virtual}
        />
      </div>
    </div>
  );
}
