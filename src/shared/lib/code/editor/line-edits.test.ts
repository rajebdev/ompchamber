/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The line commands: move, duplicate, delete, insert, and the caret's line
 * edges.
 *
 * The cases that matter are the document's edges — the first and last line have
 * no neighbour to swap with, a last line with no trailing newline still needs its
 * own separator, and a line deleted rather than blanked. Each of those was a
 * visible bug in the naive concatenation.
 */

import { describe, expect, test } from 'bun:test';

import { deleteLines, duplicateLines, insertLine, lineEdges, moveLines } from '@/shared/lib/code/editor/line-edits';

describe('moveLines', () => {
  test('moves the block up and carries the selection with it', () => {
    const result = moveLines('one\ntwo\nthree', { start: 4, end: 8 }, -1);

    expect(result.value).toBe('two\none\nthree');
    expect([result.selectionStart, result.selectionEnd]).toEqual([0, 4]);
  });

  test('moves the block down', () => {
    const result = moveLines('one\ntwo\nthree', { start: 4, end: 8 }, 1);

    expect(result.value).toBe('one\nthree\ntwo');
    expect([result.selectionStart, result.selectionEnd]).toEqual([10, 14]);
  });

  test('a block already at the edge does not move', () => {
    const first = moveLines('one\ntwo', { start: 0, end: 4 }, -1);
    expect(first.value).toBe('one\ntwo');
    expect(first.selectionStart).toBe(0);

    const last = moveLines('one\ntwo', { start: 4, end: 7 }, 1);
    expect(last.value).toBe('one\ntwo');
  });

  test('moving several lines keeps them together', () => {
    const result = moveLines('a\nb\nc\nd', { start: 2, end: 6 }, 1);

    expect(result.value).toBe('a\nd\nb\nc');
  });
});

describe('duplicateLines', () => {
  test('copies the line below and leaves the original selected', () => {
    const result = duplicateLines('one\ntwo', { start: 0, end: 4 }, 1);

    expect(result.value).toBe('one\none\ntwo');
    expect([result.selectionStart, result.selectionEnd]).toEqual([0, 4]);
  });

  test('copies above and selects the copy', () => {
    const result = duplicateLines('one\ntwo', { start: 4, end: 7 }, -1);

    expect(result.value).toBe('one\ntwo\ntwo');
    expect([result.selectionStart, result.selectionEnd]).toEqual([8, 11]);
  });

  test('a last line with no trailing newline still gets its own line', () => {
    const result = duplicateLines('one\ntwo', { start: 4, end: 7 }, 1);

    expect(result.value).toBe('one\ntwo\ntwo');
  });
});

describe('deleteLines', () => {
  test('removes the line rather than blanking it', () => {
    const result = deleteLines('one\ntwo\nthree', { start: 4, end: 8 });

    expect(result.value).toBe('one\nthree');
    expect(result.selectionStart).toBe(4);
  });

  test('deleting the last line leaves the caret at the buffer end', () => {
    const result = deleteLines('one\ntwo', { start: 4, end: 7 });

    expect(result.value).toBe('one\n');
    expect(result.selectionStart).toBe(4);
  });

  test('deleting a multi-line block removes all of it', () => {
    const result = deleteLines('a\nb\nc\nd', { start: 2, end: 6 });

    expect(result.value).toBe('a\nd');
  });
});

describe('insertLine', () => {
  test('opens a line below, keeping the indentation', () => {
    const result = insertLine('  one\ntwo', 5, 'below');

    expect(result.value).toBe('  one\n  \ntwo');
    expect(result.selectionStart).toBe(8);
  });

  test('opens a line above, keeping the indentation', () => {
    const result = insertLine('  one\ntwo', 5, 'above');

    expect(result.value).toBe('  \n  one\ntwo');
    expect(result.selectionStart).toBe(2);
  });

  test('on the buffer’s last line without a trailing newline the line is appended', () => {
    const result = insertLine('  one', 5, 'below');

    // No trailing newline: the new line simply follows, indented, and the caret
    // lands after that indent. Writing a second newline (what this used to do)
    // left a blank line under the caret.
    expect(result.value).toBe('  one\n  ');
    expect(result.selectionStart).toBe(8);
  });
});

describe('lineEdges', () => {
  test('reports the start of the line and the end of its content', () => {
    // The trailing newline is not part of the line's content, so ⌘→ stops
    // before it rather than on the next line.
    expect(lineEdges('one\ntwo\n', 5)).toEqual({ start: 4, end: 7 });
  });

  test('the last line has no newline to exclude', () => {
    expect(lineEdges('one\ntwo', 5)).toEqual({ start: 4, end: 7 });
  });
});
