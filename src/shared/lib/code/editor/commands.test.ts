/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  commentSyntaxFor,
  diffEdit,
  nextOccurrence,
  occurrenceRanges,
  replicateEdit,
  toggleLineComment,
  wordRangeAt,
} from '@/shared/lib/code/editor/commands';

describe('wordRangeAt', () => {
  test('selects the word the caret sits inside or at the end of', () => {
    expect(wordRangeAt('const alpha = 1', 8)).toEqual({ start: 6, end: 11 });
    // A caret just after the word still selects it — that is where ⌘D is
    // pressed when the user has just typed the identifier.
    expect(wordRangeAt('const alpha = 1', 11)).toEqual({ start: 6, end: 11 });
    expect(wordRangeAt('const alpha = 1', 6)).toEqual({ start: 6, end: 11 });
  });

  test('treats `$` and `_` as word characters', () => {
    expect(wordRangeAt('$foo_bar baz', 3)).toEqual({ start: 0, end: 8 });
  });

  test('a caret at the edge of a word takes that word, whitespace alone takes none', () => {
    // Offset 5 in `alpha beta` is the space right after `alpha` — the position
    // a caret sits at after typing the word, which is where ⌘D is pressed.
    expect(wordRangeAt('alpha beta', 5)).toEqual({ start: 0, end: 5 });
    // Whitespace with no word on either side: nothing to select.
    expect(wordRangeAt('  foo', 0)).toBeNull();
    expect(wordRangeAt('', 0)).toBeNull();
  });
});

describe('occurrenceRanges and nextOccurrence', () => {
  test('finds every occurrence in document order', () => {
    expect(occurrenceRanges('alpha beta alpha', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
    ]);
  });

  test('the next occurrence is the first one after the selection, then it wraps', () => {
    const text = 'a a a';
    const first = occurrenceRanges(text, 'a')[0];
    expect(nextOccurrence(text, 'a', [first])).toEqual({ start: 2, end: 3 });
    const all = occurrenceRanges(text, 'a');
    expect(nextOccurrence(text, 'a', all)).toBeNull();
  });

  test('skips ranges that are already selected', () => {
    const all = occurrenceRanges('a a a', 'a');
    expect(nextOccurrence('a a a', 'a', [all[0], all[2]])).toEqual({ start: 2, end: 3 });
  });
});

describe('diffEdit', () => {
  test('recovers an insertion from two buffers', () => {
    expect(diffEdit('abc', 'abXc')).toEqual({ start: 2, end: 2, inserted: 'X' });
  });

  test('recovers a deletion', () => {
    expect(diffEdit('abXc', 'abc')).toEqual({ start: 2, end: 3, inserted: '' });
  });

  test('recovers a replacement that swallowed a selection', () => {
    // `abc` selected and typed over with `Z`: the diff is one replacement, not
    // a deletion followed by an insertion.
    expect(diffEdit('hello world', 'hello Z')).toEqual({ start: 6, end: 11, inserted: 'Z' });
  });

  test('a limit pins the reported region over the caret, not wherever the diff prefers', () => {
    // On repetitive text a prefix/suffix diff is ambiguous — `aaXa` could be read
    // as an insertion at offset 2 (where the diff finds it) or at offset 0 (where
    // the caret was). The limit wins, and the diff stays exact either way.
    const diff = diffEdit('aaa', 'aaXa', { start: 0, end: 0 });

    expect(diff.start).toBeLessThanOrEqual(0);
    expect(diff.end).toBeGreaterThanOrEqual(0);
    expect(diff.start).toBe(0);
    // Applying the reported edit must reproduce the buffer, whichever shape the
    // limit forced: that is the property the caller depends on.
    expect('aaa'.slice(0, diff.start) + diff.inserted + 'aaa'.slice(diff.end)).toBe('aaXa');
  });
});

describe('replicateEdit', () => {
  test('applies one insertion at every range, back to front', () => {
    // Ranges 0..1 and 2..3 of `ab` — inserting `X` at both must not let the
    // first insertion shift the second range's offsets.
    const result = replicateEdit('abcd', [{ start: 0, end: 0 }, { start: 2, end: 2 }], 'X');

    expect(result.value).toBe('XabXcd');
    expect(result.carets).toEqual([1, 4]);
  });

  test('replaces the selected text at each range', () => {
    const result = replicateEdit('foo bar foo', [{ start: 0, end: 3 }, { start: 8, end: 11 }], 'qux');

    expect(result.value).toBe('qux bar qux');
    expect(result.carets).toEqual([3, 11]);
  });

  test('ranges given out of order are still applied in document order', () => {
    const result = replicateEdit('abcd', [{ start: 2, end: 2 }, { start: 0, end: 0 }], 'X');

    expect(result.value).toBe('XabXcd');
  });
});

describe('toggleLineComment', () => {
  test('comments the selected lines at their first non-space character', () => {
    const result = toggleLineComment('  one\n  two', { start: 0, end: 11 }, { line: '//' });

    expect(result.value).toBe('  // one\n  // two');
  });

  test('uncomments when every touched line is already commented', () => {
    const result = toggleLineComment('// one\n// two', { start: 0, end: 13 }, { line: '//' });

    expect(result.value).toBe('one\ntwo');
  });

  test('a mixed selection comments every line rather than half-uncommenting', () => {
    const result = toggleLineComment('// one\ntwo', { start: 0, end: 11 }, { line: '//' });

    expect(result.value).toBe('// // one\n// two');
  });

  test('only the lines the selection touches are affected', () => {
    const result = toggleLineComment('one\ntwo\nthree', { start: 4, end: 7 }, { line: '//' });

    expect(result.value).toBe('one\n// two\nthree');
  });

  test('a block-only language wraps the selection once', () => {
    const result = toggleLineComment('color: red;', { start: 0, end: 11 }, commentSyntaxFor('css'));

    expect(result.value).toBe('/* color: red; */');
  });

  test('the hash languages use their own token', () => {
    expect(commentSyntaxFor('python')).toEqual({ line: '#' });
    expect(commentSyntaxFor('yaml')).toEqual({ line: '#' });
    expect(commentSyntaxFor('sql')).toEqual({ line: '--' });
    // The default is the C-family token, which every other grammar here uses.
    expect(commentSyntaxFor('typescript')).toEqual({ line: '//' });
  });
});
