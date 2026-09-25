/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The find widget's arithmetic: what a query matches, where the caret lands
 * after a replacement, and how `$1` is expanded. These are the rules the widget
 * count, the on-screen highlights and the written buffer all read, so each is
 * asserted against the engine's own `String.replace` behaviour where one
 * exists.
 */

import { describe, expect, test } from 'bun:test';

import {
  buildFindRegex,
  expandReplacement,
  findMatches,
  lineIndexAt,
  lineStartOffset,
  matchIndexAtOrAfter,
  MAX_FIND_MATCHES,
  replaceAllMatches,
  replaceMatch,
  stepMatchIndex,
  type FindOptions,
} from '@/shared/lib/code/editor/find';

const PLAIN: FindOptions = { matchCase: false, wholeWord: false, isRegex: false };

describe('findMatches', () => {
  test('finds literal occurrences in document order, ignoring case by default', () => {
    const text = 'Alpha beta ALPHA alpha';
    expect(findMatches(text, 'alpha', PLAIN).matches).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
      { start: 17, end: 22 },
    ]);
  });

  test('matchCase narrows to the exact spelling', () => {
    expect(findMatches('Alpha alpha', 'alpha', { ...PLAIN, matchCase: true }).matches).toEqual([
      { start: 6, end: 11 },
    ]);
  });

  test('wholeWord rejects a match inside a longer word', () => {
    const text = 'cat category cat';
    expect(findMatches(text, 'cat', { ...PLAIN, wholeWord: true }).matches).toEqual([
      { start: 0, end: 3 },
      { start: 13, end: 16 },
    ]);
  });

  test('wholeWord keeps an alternation’s own precedence', () => {
    // `\bfoo|bar\b` would match `bar` inside `barbaz`; the group prevents it.
    expect(findMatches('barbaz bar', 'foo|bar', { ...PLAIN, wholeWord: true, isRegex: true }).matches).toEqual([
      { start: 7, end: 10 },
    ]);
  });

  test('regex mode compiles the query as written', () => {
    expect(findMatches('a1 b2 c3', '[a-z]\\d', { ...PLAIN, isRegex: true }).matches).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 },
    ]);
  });

  test('an uncompilable regex is reported as invalid, not as no matches', () => {
    const result = findMatches('abc', '(', { ...PLAIN, isRegex: true });
    expect(result).toEqual({ matches: [], truncated: false, invalid: true });
  });

  test('an empty query matches nothing and is not an error', () => {
    expect(findMatches('abc', '', PLAIN)).toEqual({ matches: [], truncated: false, invalid: false });
  });

  test('skips zero-width matches instead of looping forever', () => {
    const result = findMatches('abc', 'x*', { ...PLAIN, isRegex: true });
    expect(result.matches).toEqual([]);
    expect(result.invalid).toBe(false);
  });

  test('caps the collected matches and says so', () => {
    const text = 'a'.repeat(MAX_FIND_MATCHES + 10);
    const result = findMatches(text, 'a', PLAIN);
    expect(result.matches).toHaveLength(MAX_FIND_MATCHES);
    expect(result.truncated).toBe(true);
  });
});

describe('buildFindRegex', () => {
  test('escapes a literal query so regex metacharacters are literal', () => {
    const regex = buildFindRegex('a.c', PLAIN);
    expect(regex?.test('a.c')).toBe(true);
    expect(regex?.test('abc')).toBe(false);
  });

  test('returns null for an empty query and for a bad pattern', () => {
    expect(buildFindRegex('', PLAIN)).toBeNull();
    expect(buildFindRegex('[', { ...PLAIN, isRegex: true })).toBeNull();
  });
});

describe('replaceMatch', () => {
  test('literal replacement inserts the field verbatim, dollar signs included', () => {
    const text = 'const a = 1;';
    const result = replaceMatch(text, { start: 6, end: 7 }, 'a', '$&x', PLAIN);
    expect(result?.text).toBe('const $&x = 1;');
    expect(result?.caret).toBe(6 + 3);
  });

  test('regex replacement expands capture groups like String.replace', () => {
    const text = 'key = value';
    const result = replaceMatch(text, { start: 6, end: 11 }, '(\\w+)', '[$1]', { ...PLAIN, isRegex: true });
    expect(result?.text).toBe('key = [value]');
    expect(result?.caret).toBe(13);
  });

  test('refuses a match that is no longer at its offset', () => {
    expect(replaceMatch('abc', { start: 5, end: 7 }, 'a', 'z', PLAIN)).toBeNull();
  });
});

describe('replaceAllMatches', () => {
  test('literal replace-all rewrites every occurrence', () => {
    expect(replaceAllMatches('a a a', 'a', 'b', PLAIN)).toBe('b b b');
  });

  test('regex replace-all agrees with the engine', () => {
    const text = 'foo1 bar2';
    const options: FindOptions = { ...PLAIN, isRegex: true };
    expect(replaceAllMatches(text, '([a-z]+)(\\d)', '$2-$1', options)).toBe(text.replace(/([a-z]+)(\d)/g, '$2-$1'));
  });

  test('whole-word replace-all leaves substrings alone', () => {
    expect(replaceAllMatches('cat category', 'cat', 'dog', { ...PLAIN, wholeWord: true })).toBe('dog category');
  });

  test('returns null for an unusable query', () => {
    expect(replaceAllMatches('abc', '(', 'x', { ...PLAIN, isRegex: true })).toBeNull();
    expect(replaceAllMatches('abc', '', 'x', PLAIN)).toBeNull();
  });
});

describe('expandReplacement', () => {
  /** Indexed by group number, `[0]` unused — the shape `groupsOf` produces. */
  const groups = { full: 'ab12', numbered: [undefined, 'a', 'b'] as const, named: { tail: '12' } };

  test('expands $&, $1 and $<name>', () => {
    expect(expandReplacement('$&|$1|$2|$<tail>', groups)).toBe('ab12|a|b|12');
  });

  test('$$ is a literal dollar and an unknown group is empty', () => {
    expect(expandReplacement('$$$9', groups)).toBe('$');
  });

  test('a missing two-digit group falls back to the one-digit group plus the digit', () => {
    // The engine's own reading of `$12` with two groups: `$1` then a literal `2`.
    expect('x'.replace(/(x)/, '$12')).toBe('x2');
    expect(expandReplacement('$12', groups)).toBe('a2');
  });

  test('a template without a dollar is returned as-is', () => {
    expect(expandReplacement('plain', groups)).toBe('plain');
  });
});

describe('caret anchoring', () => {
  test('lineIndexAt and lineStartOffset are inverses for every line start', () => {
    const text = 'one\ntwo\n\nfour';
    // Line starts in `text`: 0, 4, 8 (the empty line) and 9.
    for (const offset of [0, 4, 8, 9]) {
      const line = lineIndexAt(text, offset);
      expect(lineStartOffset(text, line)).toBe(offset);
    }
    expect(lineIndexAt(text, 13)).toBe(3);
  });

  test('lineIndexAt clamps an offset past the end to the last line', () => {
    expect(lineIndexAt('one\ntwo', 999)).toBe(1);
  });

  test('a caret inside a match selects that match, and past the last wraps to the first', () => {
    const matches = [
      { start: 0, end: 3 },
      { start: 10, end: 13 },
    ];
    expect(matchIndexAtOrAfter(matches, 1)).toBe(0);
    expect(matchIndexAtOrAfter(matches, 3)).toBe(1);
    expect(matchIndexAtOrAfter(matches, 13)).toBe(0);
    expect(matchIndexAtOrAfter([], 0)).toBe(-1);
  });

  test('stepping wraps at both ends', () => {
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
    expect(stepMatchIndex(-1, 3, -1)).toBe(2);
    expect(stepMatchIndex(0, 0, 1)).toBe(-1);
  });
});
