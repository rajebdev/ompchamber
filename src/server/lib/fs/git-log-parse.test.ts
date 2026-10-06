/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `git log --numstat` parsing, isolated from the repository fixtures.
 *
 * The body is fenced by `\x1f`/`\x1e` in the log format precisely because a
 * body line can carry a TAB, which the numstat branch would otherwise read as
 * a changed file — and because a one-line commit still emits the record
 * separator, which must be honoured on the header line or the first file row
 * becomes body text. Both shapes are pinned here; the repository-backed
 * contract (`limit`/`skip`/`hasMore`/`total`) lives in `git-log.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { parseGitLogOutput } from '@/server/lib/fs/git-log';

describe('parseGitLogOutput', () => {
  test('empty stdout is an empty history, never a mock page', () => {
    expect(parseGitLogOutput('')).toEqual([]);
    expect(parseGitLogOutput('\n')).toEqual([]);
  });

  test('parses the header fields, refs and parents', () => {
    const stdout =
      'COMMIT_SPLIT|~|abc1234567890|~|abc1234|~|Ada|~|Jan 01, 2024, 10:00 AM|~|subject line|~|HEAD -> main, origin/main|~|p1 p2\n';
    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: 'abc1234567890',
        shortHash: 'abc1234',
        author: 'Ada',
        date: 'Jan 01, 2024, 10:00 AM',
        message: 'subject line',
        refs: ['HEAD -> main', 'origin/main'],
        parents: ['p1', 'p2'],
        files: [],
      },
    ]);
  });

  test('maps numstat rows to statuses, including binary and quoted paths', () => {
    const stdout = [
      'COMMIT_SPLIT|~|h1|~|s1|~|Ada|~|date|~|msg|~||~|',
      '1\t0\tadded.txt',
      '0\t3\tgone.txt',
      '0\t0\told.txt => new.txt',
      '2\t1\tboth.txt',
      '-\t-\tlogo.png',
      '1\t0\t"tab\\there.txt"',
      '',
    ].join('\n');
    const [commit] = parseGitLogOutput(stdout);
    expect(commit.files).toEqual([
      { file: 'added.txt', status: 'A', additions: 1, deletions: 0 },
      { file: 'gone.txt', status: 'D', additions: 0, deletions: 3 },
      { file: 'old.txt => new.txt', status: 'R', additions: 0, deletions: 0 },
      { file: 'both.txt', status: 'M', additions: 2, deletions: 1 },
      { file: 'logo.png', status: 'M', additions: 0, deletions: 0 },
      { file: 'tab\there.txt', status: 'A', additions: 1, deletions: 0 },
    ]);
  });

  test('ignores file rows before the first header and short rows', () => {
    const stdout = '1\t0\tstray.txt\nCOMMIT_SPLIT|~|h1|~|s1|~|Ada|~|date|~|msg|~||~|\ngarbage\n1\t0\tok.txt\n';
    const commits = parseGitLogOutput(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0].files).toEqual([{ file: 'ok.txt', status: 'A', additions: 1, deletions: 0 }]);
  });

  test('falls back to a short hash and an unknown author when fields are blank', () => {
    const stdout = 'COMMIT_SPLIT|~|0123456789abcdef|~||~||~||~|msg|~||~|\n';
    const [commit] = parseGitLogOutput(stdout);
    expect(commit.shortHash).toBe('01234567');
    expect(commit.author).toBe('Unknown');
    expect(commit.refs).toEqual([]);
    expect(commit.parents).toEqual([]);
  });

  test('a commit body is captured across its lines, tabs and all', () => {
    // The body is fenced by \x1f/\x1e precisely because a body line can carry a
    // TAB, which the numstat branch would otherwise read as a changed file.
    const stdout =
      'COMMIT_SPLIT|~|h1|~|s1|~|Ada|~|date|~|subject|~||~|\x1fpara one\n\n\tindented line\n\x1e\n1\t0\treal.txt\n';
    const [commit] = parseGitLogOutput(stdout);
    expect(commit.body).toBe('para one\n\n\tindented line');
    expect(commit.files).toEqual([{ file: 'real.txt', status: 'A', additions: 1, deletions: 0 }]);
  });

  test('a one-line commit has no body and still parses its file rows', () => {
    // git emits the record separator even with an empty `%b`; if it were not
    // honoured on the header line the first numstat row would become the body.
    const stdout = 'COMMIT_SPLIT|~|h1|~|s1|~|Ada|~|date|~|subject|~||~|\x1e\n2\t1\tboth.txt\n';
    const [commit] = parseGitLogOutput(stdout);
    expect(commit.body).toBeUndefined();
    expect(commit.files).toEqual([{ file: 'both.txt', status: 'M', additions: 2, deletions: 1 }]);
  });

  test('a body is fenced per commit, so the next header is not body text', () => {
    const stdout =
      'COMMIT_SPLIT|~|h1|~|s1|~|Ada|~|date|~|first|~||~|\x1fbody of first\n\x1e\n1\t0\ta.txt\n' +
      'COMMIT_SPLIT|~|h2|~|s2|~|Ada|~|date|~|second|~||~|\x1fbody of second\n\x1e\n1\t0\tb.txt\n';
    const commits = parseGitLogOutput(stdout);
    expect(commits.map((c) => c.body)).toEqual(['body of first', 'body of second']);
    expect(commits.map((c) => c.files?.[0].file)).toEqual(['a.txt', 'b.txt']);
  });
});
