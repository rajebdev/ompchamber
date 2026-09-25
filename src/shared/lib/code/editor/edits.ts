/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The text edits the editor's own keydown handler performs — Tab/⇧Tab indent,
 * backspace over an indent, and Enter's auto-indent.
 *
 * These are pure functions of the buffer and the selection, so they are
 * testable without a DOM, and the component keeps only the part that needs one
 * (reading the `<textarea>` and committing the result through the undo
 * history). Each returns `null` when the key should be left to the browser.
 */

/** What an edit produces: the new buffer and where the selection lands. */
export interface EditorEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export const TAB_CHARACTER = '  ';

/** The whole line containing `offset`, newline included. */
function lineRangeAt(text: string, offset: number): { start: number; end: number } {
  const before = text.slice(0, Math.min(offset, text.length));
  const start = before.lastIndexOf('\n') + 1;
  const nextBreak = text.indexOf('\n', start);
  return { start, end: nextBreak === -1 ? text.length : nextBreak + 1 };
}

/** Lines `[startLine, endLine]` of `text`, as offsets of their first characters. */
function lineRange(text: string, selectionStart: number, selectionEnd: number): { startLine: number; endLine: number; lines: string[] } {
  const lines = text.split('\n');
  let startLine = 0;
  for (let index = text.indexOf('\n'); index !== -1 && index < selectionStart; index = text.indexOf('\n', index + 1)) {
    startLine++;
  }
  let endLine = startLine;
  for (let index = text.indexOf('\n', selectionStart); index !== -1 && index < selectionEnd; index = text.indexOf('\n', index + 1)) {
    endLine++;
  }
  return { startLine, endLine, lines };
}

/**
 * Tab on a selection indents every line it touches; ⇧Tab removes one level.
 *
 * The selection's own edges move with the edit — an indent inserts before the
 * caret and at each line start, so a selection that is not at a line start
 * would otherwise shrink by one indent per line.
 */
export function editForTab(text: string, selectionStart: number, selectionEnd: number, unindent: boolean): EditorEdit {
  if (selectionStart === selectionEnd) {
    if (unindent) {
      // ⇧Tab on a bare caret outdents the line it sits on, which is what the
      // key means in VS Code — treating it as a no-op left ⌘[ (the same
      // command, reached from the keymap) doing nothing at all.
      const line = lineRangeAt(text, selectionStart);
      const content = text.slice(line.start, line.end);
      if (!content.startsWith(TAB_CHARACTER)) return { value: text, selectionStart, selectionEnd };
      const caret = Math.max(line.start, selectionStart - TAB_CHARACTER.length);
      return {
        value: text.slice(0, line.start) + content.slice(TAB_CHARACTER.length) + text.slice(line.end),
        selectionStart: caret,
        selectionEnd: caret,
      };
    }
    const caret = selectionStart + TAB_CHARACTER.length;
    return { value: text.slice(0, selectionStart) + TAB_CHARACTER + text.slice(selectionEnd), selectionStart: caret, selectionEnd: caret };
  }

  const { startLine, endLine, lines } = lineRange(text, selectionStart, selectionEnd);
  if (unindent) {
    const next = lines.map((line, index) =>
      index >= startLine && index <= endLine && line.startsWith(TAB_CHARACTER) ? line.slice(TAB_CHARACTER.length) : line,
    );
    const nextValue = next.join('\n');
    const firstHadIndent = lines[startLine]?.startsWith(TAB_CHARACTER) ?? false;
    return {
      value: nextValue,
      // Clamped: a selection beginning INSIDE the indent it removes shifts
      // before the buffer's own start (`0 - 2`), which only ever looked correct
      // because assigning a negative offset to a textarea clamps to zero.
      selectionStart: firstHadIndent ? Math.max(0, selectionStart - TAB_CHARACTER.length) : selectionStart,
      selectionEnd: selectionEnd - (text.length - nextValue.length),
    };
  }

  const next = lines.map((line, index) => (index >= startLine && index <= endLine ? TAB_CHARACTER + line : line));
  const firstLineText = lines[startLine];
  return {
    value: next.join('\n'),
    // The indent lands before the selection start, so a selection that begins
    // on a line with content moves with its text.
    selectionStart: firstLineText && /\S/.test(firstLineText) ? selectionStart + TAB_CHARACTER.length : selectionStart,
    selectionEnd: selectionEnd + TAB_CHARACTER.length * (endLine - startLine + 1),
  };
}

/** Backspace over a whole indent unit removes it; otherwise the browser handles the key. */
export function editForBackspace(text: string, selectionStart: number, selectionEnd: number): EditorEdit | null {
  if (selectionStart !== selectionEnd) return null;
  if (!text.slice(0, selectionStart).endsWith(TAB_CHARACTER)) return null;
  const caret = selectionStart - TAB_CHARACTER.length;
  return { value: text.slice(0, caret) + text.slice(selectionEnd), selectionStart: caret, selectionEnd: caret };
}

/** Enter keeps the current line's leading whitespace; the browser handles an unindented line. */
export function editForEnter(text: string, selectionStart: number, selectionEnd: number): EditorEdit | null {
  if (selectionStart !== selectionEnd) return null;
  const line = text.slice(0, selectionStart).split('\n').pop();
  const indent = line?.match(/^\s+/)?.[0];
  if (!indent) return null;
  const caret = selectionStart + indent.length + 1;
  return {
    value: `${text.slice(0, selectionStart)}\n${indent}${text.slice(selectionEnd)}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
}
