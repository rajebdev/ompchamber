/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The multi-selection rules.
 *
 * ⌘D's two-stage behaviour is the one users notice immediately: the first press
 * selects the word, the second adds the next occurrence. Getting that wrong
 * leaves the word selected once and its neighbour selected twice, which reads
 * as a duplicated cursor.
 */

import { describe, expect, test } from 'bun:test';

import {
  growToNextOccurrence,
  offsetBelow,
  replicateAtRanges,
  selectAllOccurrences,
} from '@/shared/lib/code/editor/occurrences';

describe('growToNextOccurrence', () => {
  const text = 'alpha beta alpha gamma alpha';

  test('the first press on a bare caret selects the word and adds nothing', () => {
    expect(growToNextOccurrence(text, { start: 2, end: 2 }, [])).toEqual({
      primary: { start: 0, end: 5 },
      extras: [],
    });
  });

  test('the second press adds the next occurrence', () => {
    const grown = growToNextOccurrence(text, { start: 0, end: 5 }, []);
    expect(grown?.primary).toEqual({ start: 0, end: 5 });
    expect(grown?.extras).toEqual([{ start: 11, end: 16 }]);
  });

  test('each further press adds the one after it, never a duplicate', () => {
    const grown = growToNextOccurrence(text, { start: 0, end: 5 }, [{ start: 11, end: 16 }]);
    expect(grown?.extras).toEqual([
      { start: 11, end: 16 },
      { start: 23, end: 28 },
    ]);
  });

  test('reports nothing when every occurrence is already selected', () => {
    const extras = [
      { start: 11, end: 16 },
      { start: 23, end: 28 },
    ];
    expect(growToNextOccurrence(text, { start: 0, end: 5 }, extras)).toBeNull();
  });

  test('reports nothing on whitespace with no word beside it', () => {
    expect(growToNextOccurrence('   ', { start: 1, end: 1 }, [])).toBeNull();
  });
});

describe('selectAllOccurrences', () => {
  test('the first occurrence is the primary, the rest are extras', () => {
    const all = selectAllOccurrences('alpha beta alpha', { start: 0, end: 5 });

    expect(all?.primary).toEqual({ start: 0, end: 5 });
    expect(all?.extras).toEqual([{ start: 11, end: 16 }]);
  });

  test('a bare caret takes the word under it', () => {
    const all = selectAllOccurrences('alpha beta alpha', { start: 2, end: 2 });
    expect(all?.primary).toEqual({ start: 0, end: 5 });
  });

  test('a one-off word yields the selection alone', () => {
    const all = selectAllOccurrences('alpha beta', { start: 0, end: 5 });
    expect(all?.primary).toEqual({ start: 0, end: 5 });
    expect(all?.extras).toEqual([]);
  });
});

describe('offsetBelow', () => {
  test('keeps the column', () => {
    expect(offsetBelow('one\ntwo\nthree', 1)).toBe(5);
  });

  test('clamps to the end of a shorter next line', () => {
    // Column 6 does not exist on `ab`; the caret lands at its end rather than
    // on a character the line never had.
    expect(offsetBelow('longer line\nab\nnext', 6)).toBe(14);
  });

  test('reports nothing on the last line', () => {
    expect(offsetBelow('one\ntwo', 5)).toBeNull();
  });
});

describe('replicateAtRanges', () => {
  test('reports nothing when there are no extra ranges', () => {
    expect(replicateAtRanges('abc', 'abXc', { start: 2, end: 2 }, [])).toBeNull();
  });

  test('replays one insertion at every range and collapses them to carets', () => {
    const applied = replicateAtRanges('alpha alpha', 'Xalpha alpha', { start: 0, end: 0 }, [{ start: 6, end: 6 }]);

    expect(applied?.value).toBe('Xalpha Xalpha');
    expect(applied?.caret).toBe(1);
    expect(applied?.rest).toEqual([{ start: 8, end: 8 }]);
  });

  test('replays a replacement over the selected text', () => {
    const applied = replicateAtRanges('alpha beta alpha', 'Z beta alpha', { start: 0, end: 5 }, [{ start: 11, end: 16 }]);

    expect(applied?.value).toBe('Z beta Z');
    // The caret sits after the inserted `Z`, which now ends the buffer.
    expect(applied?.rest).toEqual([{ start: 8, end: 8 }]);
  });
});
