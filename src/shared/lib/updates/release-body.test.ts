/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Release-body presentation for "What's new".
 *
 * A GitHub release body IS the changelog section, and it opens with the very
 * heading the popup draws itself — so `splitReleaseBody` removes that one line
 * (otherwise the version prints twice) while KEEPING its date, which is what a
 * release published without `published_at` still shows. Everything else must
 * come back untouched: this module is not a second markdown renderer.
 *
 * The risky shapes pinned here are the tolerant heading spellings (`[3.8.0](url)`,
 * `v3.8.0`, a plain `3.8.0`, with an em/en/hyphen date separator), leading blank
 * lines before the heading, a heading with no prose under it, and a hand-written
 * body that does not open with a heading at all (returned verbatim).
 */

import { describe, expect, test } from 'bun:test';

import { splitReleaseBody } from '@/shared/lib/updates/release-body';

describe('splitReleaseBody', () => {
  test('removes the linked heading and keeps its date', () => {
    const parts = splitReleaseBody('## [3.8.0](https://example.test/compare) — 2026-09-29\n\n### Added\n\n* a thing');
    expect(parts.date).toBe('2026-09-29');
    expect(parts.markdown).toBe('### Added\n\n* a thing');
  });

  test('accepts the plain and v-prefixed heading spellings', () => {
    expect(splitReleaseBody('## v3.8.0\n\nNotes').markdown).toBe('Notes');
    expect(splitReleaseBody('## 3.8.0\n\nNotes').markdown).toBe('Notes');
    expect(splitReleaseBody('## [v3.8.0](u) — 2026-09-29\n\nNotes').date).toBe('2026-09-29');
  });

  test('accepts em, en and hyphen date separators', () => {
    expect(splitReleaseBody('## 3.8.0 — 2026-09-29\n\nNotes').date).toBe('2026-09-29');
    expect(splitReleaseBody('## 3.8.0 – 2026-09-29\n\nNotes').date).toBe('2026-09-29');
    expect(splitReleaseBody('## 3.8.0 - 2026-09-29\n\nNotes').date).toBe('2026-09-29');
  });

  test('a heading without a date keeps the body and reports no date', () => {
    const parts = splitReleaseBody('## v3.8.0\n\nNotes here.');
    expect(parts.date).toBeNull();
    expect(parts.markdown).toBe('Notes here.');
  });

  test('finds the heading behind leading blank lines and drops the separating blanks', () => {
    expect(splitReleaseBody('\n\n## v1.0.0\n\n\nBody').markdown).toBe('Body');
  });

  test('a heading with nothing under it yields an empty body', () => {
    expect(splitReleaseBody('## v1.0.0')).toEqual({ date: null, markdown: '' });
    expect(splitReleaseBody('## v1.0.0\n\n\n')).toEqual({ date: null, markdown: '' });
  });

  test('a hand-written body with no heading is returned verbatim', () => {
    const body = 'Hotfix for the wiki reader.\n\n* one fix';
    expect(splitReleaseBody(body)).toEqual({ date: null, markdown: body });
  });

  test('a heading that is not the first non-empty line is not stripped', () => {
    const body = 'Intro text\n## v1.0.0\n\nBody';
    expect(splitReleaseBody(body)).toEqual({ date: null, markdown: body });
  });

  test('leaves the remaining markdown untouched', () => {
    const rest = '### Added\n\n* **bold** label\n* commit `abc1234`\n\n[link](https://example.test)';
    expect(splitReleaseBody(`## v2.0.0\n\n${rest}`).markdown).toBe(rest);
  });

  test('empty and whitespace-only bodies report no date and no markdown', () => {
    expect(splitReleaseBody('')).toEqual({ date: null, markdown: '' });
    expect(splitReleaseBody('   \n  ')).toEqual({ date: null, markdown: '' });
  });
});
