/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Line arithmetic, which every line command and the gutter depend on agreeing
 * about. The interesting cases are the two the arithmetic gets wrong by
 * accident: a caret on the empty line a trailing newline opens, and a selection
 * that ends exactly at a line start (which does not touch that line).
 */

import { describe, expect, test } from 'bun:test';

import {
  countLines,
  lineIndexAt,
  lineRangeAt,
  lineRangesInSelection,
  lineStartOffset,
} from '@/shared/lib/code/editor/lines';

describe('lineIndexAt and lineStartOffset', () => {
  test('are inverses for every line start', () => {
    const text = 'one\ntwo\n\nfour';
    // Line starts in `text`: 0, 4, 8 (the empty line) and 9.
    for (const offset of [0, 4, 8, 9]) {
      expect(lineStartOffset(text, lineIndexAt(text, offset))).toBe(offset);
    }
    expect(lineIndexAt(text, 13)).toBe(3);
  });

  test('clamp an offset past the end to the last line', () => {
    expect(lineIndexAt('one\ntwo', 999)).toBe(1);
    expect(lineStartOffset('one\ntwo', 99)).toBe(7);
  });

  test('count a trailing newline as opening one more, empty line', () => {
    expect(countLines('one\ntwo')).toBe(2);
    expect(countLines('one\ntwo\n')).toBe(3);
    expect(countLines('')).toBe(1);
  });
});

describe('lineRangeAt', () => {
  test('includes the trailing newline, so the range can delete or move the line', () => {
    expect(lineRangeAt('one\ntwo\nthree', 5)).toEqual({ start: 4, end: 8 });
  });

  test('the last line has no newline to include', () => {
    expect(lineRangeAt('one\ntwo', 5)).toEqual({ start: 4, end: 7 });
  });

  test('a caret on the empty line a trailing newline opens yields an empty range there', () => {
    // `a\n` has an empty second line at offset 2; the honest reading of that
    // position is "no characters of its own", not the previous line.
    expect(lineRangeAt('a\n', 2)).toEqual({ start: 2, end: 2 });
  });
});

describe('lineRangesInSelection', () => {
  test('covers every line the selection touches', () => {
    const text = 'one\ntwo\nthree';
    expect(lineRangesInSelection(text, { start: 4, end: 7 })).toEqual([{ start: 4, end: 8 }]);
    expect(lineRangesInSelection(text, { start: 0, end: 7 })).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
    ]);
  });

  test('a selection ending exactly at a line start does not touch that line', () => {
    // The rule VS Code applies, and the one that keeps a whole-line selection
    // from splitting off an empty trailing entry.
    const text = 'one\ntwo';
    expect(lineRangesInSelection(text, { start: 0, end: 4 })).toEqual([{ start: 0, end: 4 }]);
  });

  test('an empty selection still names the line the caret is on', () => {
    expect(lineRangesInSelection('one\ntwo', { start: 5, end: 5 })).toEqual([{ start: 4, end: 7 }]);
  });
});
