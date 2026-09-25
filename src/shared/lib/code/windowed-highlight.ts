/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LineWindow } from '@/shared/lib/code/lazy-window';
import type { FindMatch } from '@/shared/lib/code/editor/find';
import { lineStartOffset } from '@/shared/lib/code/editor/lines';
import { highlightLines } from '@/shared/lib/code/syntax-highlight';

/**
 * Lines tokenized *above* the window and dropped from the result. They only
 * seed the grammar state, so a window that starts inside a block comment or a
 * template literal still tokenizes as a comment / template literal. Tokenizing
 * them costs a fraction of the window itself; carrying the whole document as
 * context would defeat the point of windowing at all.
 */
const CONTEXT_LINES = 40;

/**
 * Lines at or above this length render as plain text. A minified bundle is one
 * line of hundreds of KB, which the tokenizer would chew through on every
 * scroll; the cap keeps that bounded, exactly like Shiki's own
 * `tokenizeMaxLineLength` bail-out.
 */
const MAX_LINE_CHARS = 12_000;

export interface HighlightCodeWindowOptions {
  /** Lines of grammar context above the window. */
  contextLines?: number;
  /** Length at which a line falls back to plain text. */
  maxLineLength?: number;
  /**
   * Find matches in DOCUMENT offsets. Only those inside the rendered window are
   * passed on, re-based to the sliced source the tokenizer sees.
   */
  marks?: readonly FindMatch[];
  /** Index of the current match within `marks`. */
  currentMark?: number;
  /** Marks from this index on are extra ⌘D selections rather than find matches. */
  occurrenceFrom?: number;
}

/**
 * Shiki markup for lines `[window.start, window.end)` of `code`, joined with
 * newlines so it can be dropped straight into the editor's `<pre>`. The caller
 * reserves the space of the lines it is not given (`lazy-window`'s
 * `windowSpace`), which is what keeps the caret over its own row.
 *
 * The rows are wrapped in `.shiki` — the app colours tokens through the
 * `.shiki span { color: var(--shiki-light) }` rule (`tailwind.css`), so markup
 * that skipped the wrapper would render in the plain ink colour. Every other
 * consumer of `highlightLines` carries the same class.
 *
 * Editing is unaffected: the `<textarea>` above the highlight layer always
 * holds the full document — only the markup is windowed.
 */
export function highlightCodeWindow(
  code: string,
  language: string,
  window: LineWindow,
  options: HighlightCodeWindowOptions = {},
): string {
  const { contextLines = CONTEXT_LINES, maxLineLength = MAX_LINE_CHARS } = options;
  const lines = code.split('\n');
  const start = Math.min(Math.max(window.start, 0), lines.length);
  const end = Math.min(Math.max(window.end, start), lines.length);
  if (start === end) return '';

  const contextStart = Math.max(0, start - contextLines);
  const slice = lines.slice(contextStart, end).join('\n');
  const base = lineStartOffset(code, contextStart);
  const sliceEnd = base + slice.length;
  const { marks, currentMark, occurrenceFrom } = rebaseMarks(
    options.marks,
    options.currentMark ?? -1,
    options.occurrenceFrom ?? -1,
    base,
    sliceEnd,
  );
  const rows = highlightLines(slice, language, { maxLineLength, marks, currentMark, occurrenceFrom });
  const offset = start - contextStart;
  return `<span class="shiki">${rows.slice(offset, offset + (end - start)).join('\n')}</span>`;
}

/**
 * The marks inside `[base, sliceEnd)`, shifted to slice coordinates, with the
 * current-match index remapped — the index points into the full list, so the
 * rows below the window cannot simply reuse it.
 */
function rebaseMarks(
  marks: readonly FindMatch[] | undefined,
  currentMark: number,
  occurrenceFrom: number,
  base: number,
  sliceEnd: number,
): { marks: FindMatch[]; currentMark: number; occurrenceFrom: number } {
  if (!marks || marks.length === 0) return { marks: [], currentMark: -1, occurrenceFrom: -1 };
  const kept: FindMatch[] = [];
  let remapped = -1;
  let remappedOccurrenceFrom = -1;
  for (let index = 0; index < marks.length; index++) {
    const mark = marks[index];
    if (mark.end <= base) continue;
    if (mark.start >= sliceEnd) break;
    if (index === currentMark) remapped = kept.length;
    // The first surviving occurrence keeps the split, wherever it landed: a
    // window whose opening lines held only matches still has to paint the
    // selections below them differently.
    if (remappedOccurrenceFrom === -1 && occurrenceFrom >= 0 && index >= occurrenceFrom) remappedOccurrenceFrom = kept.length;
    kept.push({ start: mark.start - base, end: Math.min(mark.end, sliceEnd) - base });
  }
  return { marks: kept, currentMark: remapped, occurrenceFrom: remappedOccurrenceFrom };
}
