/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's line commands: move, duplicate, delete, insert a line, and the
 * caret's line edges.
 *
 * Split from `editor-commands` (which owns the multi-selection and comment
 * concerns) because the two families have nothing in common beyond both being
 * pure string arithmetic — and because the repository caps a file at 350 lines.
 */

import { lineIndexAt, lineRangeAt, lineRangesInSelection, lineStartOffset, type TextRange } from '@/shared/lib/code/editor/lines';

/** The block of lines a selection touches, as ONE range. */
function selectionBlock(text: string, selection: TextRange): TextRange {
  const lines = lineRangesInSelection(text, selection);
  return { start: lines[0].start, end: lines[lines.length - 1].end };
}

/**
 * Move the selected lines up (`-1`) or down (`1`).
 *
 * The two groups are swapped as a REGION rather than as two concatenations:
 * the neighbour may be the document's last line with no trailing newline, so
 * the separator between the swapped halves has to be re-emitted from the
 * region's own shape. Getting that wrong turns `one\ntwo\nthree` into
 * `one\nthreetwo` — which is what the naive `body + neighbour` swap produced.
 *
 * The selection travels with its lines, so a repeated ⌥↑ keeps moving the same
 * block. At the document's first/last line there is no neighbour and the buffer
 * is returned unchanged.
 */
export function moveLines(
  text: string,
  selection: TextRange,
  direction: -1 | 1,
): { value: string; selectionStart: number; selectionEnd: number } {
  const block = selectionBlock(text, selection);
  const blockText = text.slice(block.start, block.end);
  const neighbour = direction === -1 ? lineRangeAt(text, block.start - 1) : lineRangeAt(text, block.end);
  if (direction === -1 && block.start === 0) {
    return { value: text, selectionStart: selection.start, selectionEnd: selection.end };
  }
  if (direction === 1 && block.end >= text.length) {
    return { value: text, selectionStart: selection.start, selectionEnd: selection.end };
  }

  const neighbourText = text.slice(neighbour.start, neighbour.end);
  // Both groups are whole lines, so each carries at most one trailing newline.
  const blockBody = blockText.replace(/\n$/, '');
  const neighbourBody = neighbourText.replace(/\n$/, '');
  const regionEndsWithNewline = text.slice(Math.min(block.start, neighbour.start), Math.max(block.end, neighbour.end)).endsWith('\n');

  const ordered = direction === -1
    ? `${blockBody}\n${neighbourBody}`
    : `${neighbourBody}\n${blockBody}`;
  const region = ordered + (regionEndsWithNewline ? '\n' : '');
  const regionStart = Math.min(block.start, neighbour.start);
  const regionEnd = Math.max(block.end, neighbour.end);

  // The block's own first line moves by exactly the neighbour's length plus the
  // separator that now precedes it.
  const shift = neighbourBody.length + 1;
  const delta = direction === -1 ? -shift : shift;
  return {
    value: text.slice(0, regionStart) + region + text.slice(regionEnd),
    selectionStart: selection.start + delta,
    selectionEnd: selection.end + delta,
  };
}

/** Copy the selected lines below (`1`) or above (`-1`); the copy stays selected. */
export function duplicateLines(
  text: string,
  selection: TextRange,
  direction: -1 | 1,
): { value: string; selectionStart: number; selectionEnd: number } {
  const block = selectionBlock(text, selection);
  const body = text.slice(block.start, block.end);
  // A block that reaches the end of a document with no trailing newline needs
  // one, or the copy would land on the same line it came from.
  const separator = body.endsWith('\n') ? '' : '\n';

  if (direction === 1) {
    const inserted = separator + body;
    return {
      value: text.slice(0, block.end) + inserted + text.slice(block.end),
      selectionStart: selection.start,
      selectionEnd: selection.end,
    };
  }
  const inserted = body + separator;
  return {
    value: text.slice(0, block.start) + inserted + text.slice(block.start),
    selectionStart: selection.start + inserted.length,
    selectionEnd: selection.end + inserted.length,
  };
}

/**
 * Delete the selected lines, newline included — so the line is gone rather than
 * blanked. The caret lands at the start of the line that took its place, or at
 * the end of the buffer when the last line was deleted.
 */
export function deleteLines(
  text: string,
  selection: TextRange,
): { value: string; selectionStart: number; selectionEnd: number } {
  const block = selectionBlock(text, selection);
  const value = text.slice(0, block.start) + text.slice(block.end);
  const caret = Math.min(block.start, value.length);
  return { value, selectionStart: caret, selectionEnd: caret };
}

/**
 * Open a new line above or below the caret's line, keeping that line's
 * indentation. ⌘⏎ is "below" and ⌘⇧⏎ is "above", like VS Code.
 */
export function insertLine(
  text: string,
  offset: number,
  where: 'above' | 'below',
): { value: string; selectionStart: number; selectionEnd: number } {
  const line = lineRangeAt(text, offset);
  const lineText = text.slice(line.start, line.end).replace(/\n$/, '');
  const indent = lineText.match(/^\s*/)?.[0] ?? '';

  if (where === 'above') {
    const caret = line.start + indent.length;
    return {
      value: `${text.slice(0, line.start)}${indent}\n${text.slice(line.start)}`,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  // Below a line that already ends in a newline the new line is inserted
  // BEFORE that successor; below the document's last line the newline has to be
  // written first. Emitting both unconditionally left a blank line behind
  // (measured: `a\nb` + ⌘⏎ became `a\nb\n\n`).
  const lineEndsWithNewline = text[line.end - 1] === '\n';
  const inserted = lineEndsWithNewline ? `${indent}\n` : `\n${indent}`;
  const caret = line.end + inserted.length - (lineEndsWithNewline ? 1 : 0);
  return {
    value: text.slice(0, line.end) + inserted + text.slice(line.end),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/** The offset at the start of the caret's line, and at the end of it (⌘← / ⌘→). */
export function lineEdges(text: string, offset: number): { start: number; end: number } {
  const line = lineRangeAt(text, offset);
  const start = lineStartOffset(text, lineIndexAt(text, offset));
  return { start, end: Math.max(start, line.end - (text[line.end - 1] === '\n' ? 1 : 0)) };
}
