/**
 * The once-per-version latch, and the release-range filter behind the popup.
 *
 * Both are pure and both decide something the user sees: whether the dialog
 * interrupts at all, and which versions it describes. The range rules are the
 * ones a real repository exercises — a version behind by one release, a version
 * behind by many, a dev build that is not in the list, and a local build newer
 * than the newest release.
 */

import { describe, expect, test } from 'bun:test';

import { capReleaseNotes, selectReleaseRange } from '@/server/lib/updates/changelog';
import type { GitHubRelease } from '@/server/lib/updates/github';
import { splitReleaseBody } from '@/shared/lib/updates/release-body';
import { shouldAnnounce } from '@/shared/lib/updates/popup-state';
import type { ReleaseNote } from '@/shared/types/updates';

function release(tag: string, body = ''): GitHubRelease {
  return { tag, name: tag, url: `https://example.test/${tag}`, publishedAt: null, body };
}

describe('shouldAnnounce', () => {
  test('announces a version that has never been shown', () => {
    expect(shouldAnnounce('3.8.0', null)).toBe(true);
  });

  test('does not re-announce the version already shown', () => {
    expect(shouldAnnounce('3.8.0', '3.8.0')).toBe(false);
  });

  test('announces the next release after one was shown', () => {
    expect(shouldAnnounce('3.9.0', '3.8.0')).toBe(true);
  });

  test('never announces without a version to name', () => {
    expect(shouldAnnounce(null, null)).toBe(false);
    expect(shouldAnnounce('', '3.8.0')).toBe(false);
  });
});

describe('selectReleaseRange', () => {
  const releases = [release('v3.8.0'), release('v3.7.1'), release('v3.7.0'), release('v3.6.0'), release('v3.5.0')];

  test('takes every release above the installed version, newest first', () => {
    const range = selectReleaseRange(releases, '3.6.0', '3.8.0');
    expect(range.map((entry) => entry.tag)).toEqual(['v3.8.0', 'v3.7.1', 'v3.7.0']);
  });

  test('excludes the installed version itself', () => {
    expect(selectReleaseRange(releases, '3.7.1', '3.8.0').map((entry) => entry.tag)).toEqual(['v3.8.0']);
  });

  test('ignores anything newer than the target release', () => {
    const withNewer = [release('v3.9.0'), ...releases];
    expect(selectReleaseRange(withNewer, '3.6.0', '3.8.0').map((entry) => entry.tag)).toEqual(['v3.8.0', 'v3.7.1', 'v3.7.0']);
  });

  test('falls back to the newest release alone when the installed version is unknown', () => {
    expect(selectReleaseRange(releases, null, '3.8.0').map((entry) => entry.tag)).toEqual(['v3.8.0']);
  });

  test('is empty without a target release', () => {
    expect(selectReleaseRange(releases, '3.6.0', null)).toEqual([]);
  });
});

describe('capReleaseNotes', () => {
  const note = (version: string, body = 'x'): ReleaseNote => ({
    version,
    tag: `v${version}`,
    name: `v${version}`,
    url: `https://example.test/${version}`,
    publishedAt: null,
    body,
  });

  test('keeps the newest versions when the count cap bites', () => {
    const notes = Array.from({ length: 25 }, (_, i) => note(`1.${25 - i}.0`));
    const { versions, truncated } = capReleaseNotes(notes);
    expect(truncated).toBe(true);
    expect(versions.length).toBe(20);
    expect(versions[0]!.version).toBe('1.25.0');
  });

  test('drops the oldest sections when the byte budget bites', () => {
    const notes = [note('3.0.0', 'a'.repeat(80_000)), note('2.0.0', 'b'.repeat(80_000)), note('1.0.0', 'c')];
    const { versions, truncated } = capReleaseNotes(notes);
    expect(truncated).toBe(true);
    // 80k + 80k is over the 120k budget, so only the newest section survives.
    expect(versions.map((v) => v.version)).toEqual(['3.0.0']);
  });

  test('keeps every section that fits the byte budget', () => {
    const notes = [note('3.0.0', 'a'.repeat(50_000)), note('2.0.0', 'b'.repeat(50_000)), note('1.0.0', 'c'.repeat(50_000))];
    const { versions, truncated } = capReleaseNotes(notes);
    expect(truncated).toBe(true);
    expect(versions.map((v) => v.version)).toEqual(['3.0.0', '2.0.0']);
  });

  test('never drops the newest section, however large it is', () => {
    const { versions, truncated } = capReleaseNotes([note('3.0.0', 'a'.repeat(200_000))]);
    expect(truncated).toBe(false);
    expect(versions.length).toBe(1);
  });

  test('reports nothing truncated when the list fits', () => {
    const { versions, truncated } = capReleaseNotes([note('2.0.0'), note('1.0.0')]);
    expect(truncated).toBe(false);
    expect(versions.length).toBe(2);
  });
});

describe('splitReleaseBody', () => {
  test('removes the leading changelog heading and keeps its date', () => {
    const body = '## [3.8.0](https://example.test/compare) — 2026-09-29\n\n### Added\n\n* a thing\n';
    const parts = splitReleaseBody(body);
    expect(parts.date).toBe('2026-09-29');
    expect(parts.markdown).toBe('### Added\n\n* a thing');
  });

  test('handles a plain version heading with no date', () => {
    const parts = splitReleaseBody('## v3.8.0\n\nNotes here.');
    expect(parts.date).toBeNull();
    expect(parts.markdown).toBe('Notes here.');
  });

  test('leaves a hand-written body alone', () => {
    const parts = splitReleaseBody('Hotfix for the wiki reader.');
    expect(parts.date).toBeNull();
    expect(parts.markdown).toBe('Hotfix for the wiki reader.');
  });

  test('returns nothing for an empty body', () => {
    expect(splitReleaseBody('')).toEqual({ date: null, markdown: '' });
  });
});
