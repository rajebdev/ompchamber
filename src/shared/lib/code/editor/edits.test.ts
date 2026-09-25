/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's indent edits, which are the rules a reader notices only when
 * they are wrong: Tab indents every line the selection touches, ⇧Tab removes
 * one level, and the selection's own edges move with the text so a selection
 * that does not start at a line start is not silently shortened.
 */

import { describe, expect, test } from 'bun:test';

import { editForBackspace, editForEnter, editForTab, TAB_CHARACTER } from '@/shared/lib/code/editor/edits';

describe('editForTab', () => {
  test('inserts one indent at the caret and lands after it', () => {
    const edit = editForTab('const a = 1;', 6, 6, false);

    expect(edit.value).toBe(`const ${TAB_CHARACTER}a = 1;`);
    expect([edit.selectionStart, edit.selectionEnd]).toEqual([8, 8]);
  });

  test('indents every line the selection touches', () => {
    const edit = editForTab('one\ntwo\nthree', 0, 7, false);

    expect(edit.value).toBe(`${TAB_CHARACTER}one\n${TAB_CHARACTER}two\nthree`);
    // The end moves by one indent per touched line, so the selection still
    // covers the same text.
    expect(edit.selectionEnd).toBe(7 + TAB_CHARACTER.length * 2);
  });

  test('an indent moves a selection that starts on a line with content', () => {
    // The indent is inserted BEFORE the selection start, so the selection has
    // to move with its own text or it would silently cover different bytes.
    const midLine = editForTab('one\ntwo', 1, 5, false);
    expect(midLine.value).toBe(`${TAB_CHARACTER}one\n${TAB_CHARACTER}two`);
    expect(midLine.selectionStart).toBe(1 + TAB_CHARACTER.length);
    expect(midLine.selectionEnd).toBe(5 + TAB_CHARACTER.length * 2);
  });

  test('unindents only the lines that carry an indent', () => {
    const edit = editForTab(`${TAB_CHARACTER}one\ntwo`, 0, 9, true);

    expect(edit.value).toBe('one\ntwo');
    expect(edit.selectionStart).toBe(0);
    expect(edit.selectionEnd).toBe(9 - TAB_CHARACTER.length);
  });

  test('unindenting a selection whose first line has no indent keeps the start', () => {
    const edit = editForTab(`one\n${TAB_CHARACTER}two`, 0, 9, true);

    expect(edit.value).toBe('one\ntwo');
    expect(edit.selectionStart).toBe(0);
  });

  test('⇧Tab with nothing selected leaves the buffer alone', () => {
    const edit = editForTab('one', 2, 2, true);

    expect(edit.value).toBe('one');
    expect([edit.selectionStart, edit.selectionEnd]).toEqual([2, 2]);
  });
});

describe('editForBackspace', () => {
  test('removes a whole indent unit', () => {
    const edit = editForBackspace(`${TAB_CHARACTER}one`, TAB_CHARACTER.length, TAB_CHARACTER.length);

    expect(edit?.value).toBe('one');
    expect(edit?.selectionStart).toBe(0);
  });

  test('leaves a partial indent to the browser', () => {
    // One space of an indent is an ordinary character deletion.
    expect(editForBackspace(' one', 1, 1)).toBeNull();
    expect(editForBackspace('one', 3, 3)).toBeNull();
  });

  test('never fires over a selection', () => {
    expect(editForBackspace('  one', 0, 2)).toBeNull();
  });
});

describe('editForEnter', () => {
  test('keeps the current line’s leading whitespace', () => {
    const edit = editForEnter('  one', 5, 5);

    expect(edit?.value).toBe('  one\n  ');
    expect(edit?.selectionStart).toBe(8);
  });

  test('a line with no indent is left to the browser', () => {
    expect(editForEnter('one', 3, 3)).toBeNull();
  });

  test('a selection is never auto-indented', () => {
    expect(editForEnter('  one', 2, 5)).toBeNull();
  });
});
