/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The whitespace toggle's contract. Trimming the displayed text left a
 * whitespace-only rewrite painted red/green and counted in `+n/-n`, so the
 * toggle changed the glyphs and nothing else — these cases pin the behavior a
 * reader actually expects from it.
 */

import { describe, expect, test } from 'bun:test';

import { parseUnifiedDiff } from '@/shared/lib/fs/diff-parser';

const WHITESPACE_ONLY = [
  'diff --git a/ws.ts b/ws.ts',
  'index 46378b4..c824424 100644',
  '--- a/ws.ts',
  '+++ b/ws.ts',
  '@@ -1,3 +1,3 @@',
  ' function ws() {',
  '-  return 1;',
  '+    return 1;',
  ' }',
  '',
].join('\n');

const REAL_CHANGE = [
  'diff --git a/main.ts b/main.ts',
  '--- a/main.ts',
  '+++ b/main.ts',
  '@@ -1,2 +1,2 @@',
  ' export const a = 1;',
  '-export function f() { return a; }',
  '+export function f() { return a + 1; }',
  '',
].join('\n');

const MIXED = [
  'diff --git a/mixed.ts b/mixed.ts',
  '--- a/mixed.ts',
  '+++ b/mixed.ts',
  '@@ -1,3 +1,3 @@',
  '-  const a = 1;',
  '+    const a = 1;',
  '-  const b = 2;',
  '+  const b = 3;',
  '',
].join('\n');

describe('parseUnifiedDiff', () => {
  test('counts and marks a whitespace-only rewrite by default', () => {
    const { lines, additions, deletions } = parseUnifiedDiff(WHITESPACE_ONLY);

    expect(additions).toBe(1);
    expect(deletions).toBe(1);
    expect(lines.filter((l) => l.type === 'add')).toHaveLength(1);
    expect(lines.filter((l) => l.type === 'del')).toHaveLength(1);
  });

  test('folds a whitespace-only rewrite into context when ignoring whitespace', () => {
    const { lines, splitRows, additions, deletions } = parseUnifiedDiff(WHITESPACE_ONLY, { ignoreWhitespace: true });

    // The counts the toolbar renders must match what is on screen.
    expect(additions).toBe(0);
    expect(deletions).toBe(0);
    expect(lines.some((l) => l.type === 'add' || l.type === 'del')).toBe(false);

    const folded = lines.find((l) => l.type === 'context' && l.oldLineNumber === 2);
    expect(folded?.newLineNumber).toBe(2);
    expect(folded?.text).toBe('    return 1;');

    // Split view reads the same decision — it is built by the same flush.
    const row = splitRows.find((r) => r.left?.lineNumber === 2);
    expect(row?.left?.type).toBe('context');
    expect(row?.right?.type).toBe('context');
    expect(row?.left?.text).toBe('  return 1;');
    expect(row?.right?.text).toBe('    return 1;');
  });

  test('keeps a real change when ignoring whitespace', () => {
    const { lines, additions, deletions } = parseUnifiedDiff(REAL_CHANGE, { ignoreWhitespace: true });

    expect(additions).toBe(1);
    expect(deletions).toBe(1);
    expect(lines.find((l) => l.type === 'del')?.text).toBe('export function f() { return a; }');
    expect(lines.find((l) => l.type === 'add')?.text).toBe('export function f() { return a + 1; }');
  });

  test('folds only the whitespace pair of a mixed hunk', () => {
    const { lines, additions, deletions } = parseUnifiedDiff(MIXED, { ignoreWhitespace: true });

    // Line 1 differs by indentation only; line 2 is a genuine edit.
    expect(additions).toBe(1);
    expect(deletions).toBe(1);
    expect(lines.filter((l) => l.type === 'del').map((l) => l.text)).toEqual(['  const b = 2;']);
    expect(lines.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['  const b = 3;']);
  });

  test('emits unified lines in diff order (deletions before additions)', () => {
    const { lines } = parseUnifiedDiff(REAL_CHANGE);
    const kinds = lines.map((l) => l.type);

    // A git diff ends with a newline, which `split` turns into one trailing
    // empty context line — pre-existing, and the same row the view has always
    // drawn under the last change.
    expect(kinds.slice(0, 4)).toEqual(['meta', 'context', 'del', 'add']);
  });

  test('returns empty results for an empty diff', () => {
    expect(parseUnifiedDiff('', { ignoreWhitespace: true })).toEqual({ lines: [], splitRows: [], additions: 0, deletions: 0 });
    expect(parseUnifiedDiff('   \n', { ignoreWhitespace: false })).toEqual({ lines: [], splitRows: [], additions: 0, deletions: 0 });
  });
});
