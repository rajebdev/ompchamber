/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Line arithmetic over a buffer.
 *
 * Extracted from the find module because the editor's line commands (delete,
 * move, duplicate, comment) and the highlighter need the same two facts — which
 * line an offset is on, and where that line begins — and neither of them is a
 * find concern. Keeping one implementation is what stops a line command from
 * disagreeing with the gutter about where line 12 starts.
 */

/** Half-open `[start, end)` offset range in a document. */
export interface TextRange {
  start: number;
  end: number;
}

/** Index of the line containing `offset` (0-based). */
export function lineIndexAt(text: string, offset: number): number {
  const limit = Math.min(Math.max(offset, 0), text.length);
  let line = 0;
  for (let index = text.indexOf('\n'); index !== -1 && index < limit; index = text.indexOf('\n', index + 1)) {
    line++;
  }
  return line;
}

/** Offset of the first character of line `lineIndex` (0-based). */
export function lineStartOffset(text: string, lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

/** How many lines `text` holds; a trailing newline opens one more (empty) line. */
export function countLines(text: string): number {
  let count = 1;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) count++;
  return count;
}

/**
 * The whole line containing `offset`, INCLUDING its trailing newline.
 *
 * Including the newline is what makes the range directly usable by the line
 * commands: deleting it removes the line rather than blanking it, and moving it
 * carries the line's own separator with it. A caret on the empty line a
 * trailing newline opens (`"a\n"` at offset 2) yields an empty range there,
 * which the commands treat as "the newline above" — the honest reading of a
 * position that has no characters of its own.
 */
export function lineRangeAt(text: string, offset: number): TextRange {
  const lineStart = lineStartOffset(text, lineIndexAt(text, offset));
  const lineEnd = text.indexOf('\n', lineStart);
  if (lineEnd === -1) return { start: lineStart, end: text.length };
  return { start: lineStart, end: lineEnd + 1 };
}

/**
 * The ranges of every line a selection touches, in document order.
 *
 * A selection ending exactly at a line start does not touch that line — the
 * same rule VS Code applies, and the one that keeps ⌘⇧L on a whole-line
 * selection from splitting off an empty trailing entry.
 */
export function lineRangesInSelection(text: string, selection: TextRange): TextRange[] {
  const startLine = lineIndexAt(text, selection.start);
  const lastOffset = selection.end > selection.start && text[selection.end - 1] === '\n' ? selection.end - 1 : selection.end;
  const endLine = lineIndexAt(text, lastOffset);
  const ranges: TextRange[] = [];
  for (let line = startLine; line <= endLine; line++) {
    ranges.push(lineRangeAt(text, lineStartOffset(text, line)));
  }
  return ranges;
}
