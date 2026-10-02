/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The update path's three decidable pieces: the release-range/cap math in
 * `changelog.ts`, the GitHub read in `github.ts`, and the "omp is not
 * installed" contract in `omp.ts`.
 *
 * The range is what a user actually sees: a release equal to the installed
 * version must NOT appear (that is the "already current" decision), a release
 * newer than the published `latest` must not either, and the caps must trim the
 * OLDEST sections while never emptying the list — "showing 12 of 29" is only
 * honest if the newest are the ones kept. The GitHub read is exercised against
 * an injected `fetch` (no network) to pin field mapping, the `per_page` clamp,
 * and the `globalThis` cache's limit/TTL/empty-read rules. `omp.ts` is pinned
 * only where it does not spawn a process: the missing-binary guard.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { MAX_NOTES_BYTES, MAX_VERSIONS, capReleaseNotes, selectReleaseRange } from '@/server/lib/updates/changelog';
import { RELEASE_LIST_LIMIT, fetchLatestRelease, fetchReleases } from '@/server/lib/updates/github';
import { checkOmpUpdate, applyOmpUpdate } from '@/server/lib/updates/omp';
import { invalidateOmpCliCache } from '@/server/lib/omp/core/cli';
import type { GitHubRelease } from '@/server/lib/updates/github';
import type { ReleaseNote } from '@/shared/types/updates';

const release = (tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag,
  name: tag,
  url: `https://example.test/${tag}`,
  publishedAt: null,
  body: '',
  ...extra,
});

const note = (version: string, body = ''): ReleaseNote => ({
  version,
  tag: `v${version}`,
  name: `v${version}`,
  url: `https://example.test/${version}`,
  publishedAt: null,
  body,
});

describe('selectReleaseRange', () => {
  test('with no latest there is nothing to announce', () => {
    expect(selectReleaseRange([release('v1.0.0')], '0.5.0', null)).toEqual([]);
  });

  test('keeps releases above the installed version and up to latest, newest first', () => {
    const range = selectReleaseRange(
      [release('v1.0.0'), release('v3.0.0'), release('v2.5.0'), release('v0.9.0'), release('v4.0.0')],
      '1.0.0',
      '3.0.0',
    );
    expect(range.map((r) => r.tag)).toEqual(['v3.0.0', 'v2.5.0']);
  });

  test('the installed version itself is excluded — the already-current decision', () => {
    expect(selectReleaseRange([release('v2.0.0')], '2.0.0', '2.0.0')).toEqual([]);
  });

  test('with no readable installed version the range is the latest release alone', () => {
    const range = selectReleaseRange([release('v1.0.0'), release('v3.0.0'), release('v2.0.0')], null, '2.0.0');
    expect(range.map((r) => r.tag)).toEqual(['v2.0.0']);
  });

  test('a pre-release tag compares by its numeric core when a current version is known', () => {
    const range = selectReleaseRange([release('v2.0.0-beta.1')], '1.0.0', '2.0.0');
    expect(range.map((r) => r.tag)).toEqual(['v2.0.0-beta.1']);
  });

  test('with no installed version the latest match is on the raw normalized string', () => {
    expect(selectReleaseRange([release('v2.0.0-beta.1')], null, '2.0.0')).toEqual([]);
  });

  test('a blank or non-numeric tag is dropped', () => {
    expect(selectReleaseRange([release(''), release('nightly')], null, '2.0.0')).toEqual([]);
  });
});

describe('capReleaseNotes', () => {
  test('under both caps nothing is trimmed', () => {
    const notes = [note('2.0.0', 'x'.repeat(10)), note('1.9.0', 'y'.repeat(10))];
    expect(capReleaseNotes(notes)).toEqual({ versions: notes, truncated: false });
  });

  test('more than MAX_VERSIONS sections keeps the newest and reports truncation', () => {
    const notes = Array.from({ length: MAX_VERSIONS + 1 }, (_, i) => note(`1.0.${i}`));
    const { versions, truncated } = capReleaseNotes(notes);
    expect(versions).toHaveLength(MAX_VERSIONS);
    expect(versions[0]).toBe(notes[0]!);
    expect(truncated).toBe(true);
  });

  test('the byte budget drops the oldest sections', () => {
    const notes = [note('3.0.0', 'a'.repeat(60_000)), note('2.0.0', 'b'.repeat(60_000)), note('1.0.0', 'c'.repeat(60_000))];
    const { versions, truncated } = capReleaseNotes(notes);
    expect(versions.map((n) => n.version)).toEqual(['3.0.0', '2.0.0']);
    expect(truncated).toBe(true);
  });

  test('a total exactly at the byte budget is kept whole', () => {
    const notes = [note('2.0.0', 'a'.repeat(MAX_NOTES_BYTES / 2)), note('1.0.0', 'b'.repeat(MAX_NOTES_BYTES / 2))];
    const { versions, truncated } = capReleaseNotes(notes);
    expect(versions).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  test('a single oversized section is still kept — the list is never emptied', () => {
    const { versions, truncated } = capReleaseNotes([note('1.0.0', 'z'.repeat(MAX_NOTES_BYTES + 1))]);
    expect(versions).toHaveLength(1);
    expect(truncated).toBe(false);
  });
});

describe('fetchReleases', () => {
  const originalFetch = globalThis.fetch;
  let urls: string[] = [];
  let payload: unknown = [];

  beforeEach(() => {
    delete (globalThis as typeof globalThis & { __ompChamberReleaseCache?: unknown }).__ompChamberReleaseCache;
    urls = [];
    payload = [
      {
        tag_name: 'v2.1.0',
        name: 'Two One',
        html_url: 'https://example.test/v2.1.0',
        published_at: '2026-09-01T00:00:00Z',
        body: 'notes',
      },
    ];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as typeof globalThis & { __ompChamberReleaseCache?: unknown }).__ompChamberReleaseCache;
  });

  test('maps GitHub fields and includes the body', async () => {
    const [first] = await fetchReleases();
    expect(first).toEqual({
      tag: 'v2.1.0',
      name: 'Two One',
      url: 'https://example.test/v2.1.0',
      publishedAt: '2026-09-01T00:00:00Z',
      body: 'notes',
    });
    expect(urls[0]).toContain(`releases?per_page=30`);
  });

  test('the requested page is clamped to [1, RELEASE_LIST_LIMIT]', async () => {
    await fetchReleases({ limit: RELEASE_LIST_LIMIT + 500 });
    expect(urls[0]).toContain(`releases?per_page=${RELEASE_LIST_LIMIT}`);
    await fetchReleases({ limit: 0, force: true });
    expect(urls[1]).toContain('releases?per_page=1');
  });

  test('a repeat read inside the TTL is served from the cache', async () => {
    await fetchReleases({ limit: 30 });
    await fetchReleases({ limit: 30 });
    expect(urls).toHaveLength(1);
  });

  test('a smaller limit is served from a larger cached page', async () => {
    await fetchReleases({ limit: 50 });
    await fetchReleases({ limit: 10 });
    expect(urls).toHaveLength(1);
  });

  test('a larger limit forces a fresh read', async () => {
    await fetchReleases({ limit: 10 });
    await fetchReleases({ limit: 50 });
    expect(urls).toHaveLength(2);
  });

  test('force bypasses a warm cache', async () => {
    await fetchReleases({ limit: 30 });
    await fetchReleases({ limit: 30, force: true });
    expect(urls).toHaveLength(2);
  });

  test('an empty read is not cached', async () => {
    payload = [];
    await fetchReleases({ limit: 30 });
    await fetchReleases({ limit: 30 });
    expect(urls).toHaveLength(2);
  });
});

describe('fetchLatestRelease', () => {
  const originalFetch = globalThis.fetch;
  let urls: string[] = [];

  beforeEach(() => {
    urls = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({ tag_name: 'v9.9.9', name: 'Nine', html_url: 'https://example.test/v9.9.9', body: 'ignored' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('reads /releases/latest and omits the body', async () => {
    const latest = await fetchLatestRelease();
    expect(urls[0]).toContain('releases/latest');
    expect(latest).toEqual({
      tag: 'v9.9.9',
      name: 'Nine',
      url: 'https://example.test/v9.9.9',
      publishedAt: null,
      body: '',
    });
  });
});

describe('omp binary guard', () => {
  const realOverride = Bun.env.OMPCHAMBER_OMP_BIN;

  beforeEach(() => {
    // A path that cannot exist: probeOmpBin returns null from the override
    // without ever touching PATH, so the guard is deterministic on any machine.
    Bun.env.OMPCHAMBER_OMP_BIN = '/nonexistent/ompchamber-test-omp';
    invalidateOmpCliCache();
  });

  afterEach(() => {
    if (realOverride === undefined) delete Bun.env.OMPCHAMBER_OMP_BIN;
    else Bun.env.OMPCHAMBER_OMP_BIN = realOverride;
    invalidateOmpCliCache();
  });

  test('checkOmpUpdate reports omp as not installed without spawning it', async () => {
    expect(await checkOmpUpdate()).toEqual({
      current: null,
      latest: null,
      updateAvailable: false,
      installed: false,
      error: 'omp binary not found',
    });
  });

  test('applyOmpUpdate refuses to run without a binary', async () => {
    await expect(applyOmpUpdate()).rejects.toThrow('omp binary not found');
  });
});
