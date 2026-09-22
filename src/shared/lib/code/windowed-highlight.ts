/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LineWindow } from '@/shared/lib/code/lazy-window';
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
  const rows = highlightLines(lines.slice(contextStart, end).join('\n'), language, { maxLineLength });
  const offset = start - contextStart;
  return `<span class="shiki">${rows.slice(offset, offset + (end - start)).join('\n')}</span>`;
}
