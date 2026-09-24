/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import { createRepoStore, type RepoFetch, type RepoScheduler } from '@/client/hooks/workspace/repo-scope/store';

/** Resolves each request from a per-root table, recording the roots asked for. */
function fakeFetch(byRoot: Record<string, { repos: string[]; reposPending?: boolean }>) {
  const requested: string[] = [];
  const fetchImpl: RepoFetch = async (url) => {
    const root = new URL(url, 'http://localhost').searchParams.get('root') ?? '';
    requested.push(root);
    return byRoot[root] ?? { repos: ['.'] };
  };
  return { fetchImpl, requested };
}

/** Retries the caller arms, so a test can fire them instead of waiting them out. */
function fakeScheduler() {
  const armed: (() => void)[] = [];
  const scheduler: RepoScheduler = (run) => {
    armed.push(run);
    return () => {
      const index = armed.indexOf(run);
      if (index >= 0) armed.splice(index, 1);
    };
  };
  return { scheduler, armed };
}

describe('repo list invalidation on workspace switch', () => {
  test('a new root never reports the previous root\'s repos', async () => {
    const { fetchImpl } = fakeFetch({
      '/ws/a': { repos: ['.', 'projects/a'] },
      '/ws/b': { repos: ['.', 'projects/b'] },
    });
    const store = createRepoStore({ fetch: fetchImpl });

    const seenA: string[][] = [];
    const unsubscribeA = store.subscribe('/ws/a', () => seenA.push(store.snapshot('/ws/a').repos));
    await store.settled('/ws/a');
    expect(store.snapshot('/ws/a').repos).toEqual(['.', 'projects/a']);

    // Switching workspaces: root B has no entry, so it starts from the root
    // alone — not from A's list.
    expect(store.snapshot('/ws/b').repos).toEqual(['.']);
    unsubscribeA();

    const seenB: string[][] = [];
    const unsubscribeB = store.subscribe('/ws/b', () => seenB.push(store.snapshot('/ws/b').repos));
    await store.settled('/ws/b');
    expect(store.snapshot('/ws/b').repos).toEqual(['.', 'projects/b']);
    // Every notification for B reported B's list — A's list was never published
    // under B, not even for the render before the read landed.
    expect(seenB).toEqual([['.'], ['.', 'projects/b']]);
    expect(seenA).toEqual([['.'], ['.', 'projects/a']]);
    unsubscribeB();
  });

  test('a list already discovered for a root is reused without re-asking', async () => {
    const { fetchImpl, requested } = fakeFetch({ '/ws/a': { repos: ['.', 'projects/a'] } });
    const store = createRepoStore({ fetch: fetchImpl });

    const unsubscribeFirst = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    unsubscribeFirst();
    expect(requested).toEqual(['/ws/a']);

    // A right-panel view switch re-subscribes to the same root.
    const unsubscribeSecond = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(requested).toEqual(['/ws/a']);
    expect(store.snapshot('/ws/a').repos).toEqual(['.', 'projects/a']);
    unsubscribeSecond();
  });

  test('an unsettled discovery is resumed, not abandoned, when a subscriber returns', async () => {
    const { fetchImpl, requested } = fakeFetch({ '/ws/a': { repos: ['.'], reposPending: true } });
    const { scheduler, armed } = fakeScheduler();
    const store = createRepoStore({ fetch: fetchImpl, scheduler });

    const unsubscribe = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(store.snapshot('/ws/a').scanning).toBe(true);
    expect(armed).toHaveLength(1);
    unsubscribe();
    // The retry is dropped with the last subscriber rather than left armed.
    expect(armed).toHaveLength(0);

    // Re-subscribing resumes the scan instead of inheriting a spinner that
    // nothing drives.
    const unsubscribeAgain = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(requested).toEqual(['/ws/a', '/ws/a']);
    expect(armed).toHaveLength(1);
    unsubscribeAgain();
  });

  test('a failed discovery leaves the root unlisted so the next subscriber retries', async () => {
    let calls = 0;
    const store = createRepoStore({
      fetch: async () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        return { repos: ['.', 'projects/a'] };
      },
    });

    const unsubscribe = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(store.snapshot('/ws/a').repos).toEqual(['.']);
    unsubscribe();

    const unsubscribeAgain = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(calls).toBe(2);
    expect(store.snapshot('/ws/a').repos).toEqual(['.', 'projects/a']);
    unsubscribeAgain();
  });

  test('a response that lands after its root lost every subscriber is dropped', async () => {
    const gate = Promise.withResolvers<unknown>();
    const store = createRepoStore({ fetch: () => gate.promise });

    const unsubscribe = store.subscribe('/ws/a', () => {});
    unsubscribe();
    gate.resolve({ repos: ['.', 'projects/a'] });
    await store.settled('/ws/a');

    // The read was abandoned with the subscription: nothing is reported for a
    // root nobody is showing.
    expect(store.snapshot('/ws/a').repos).toEqual(['.']);
  });

  test('a rescan reports the fresh list and clears the pending flag', async () => {
    let repos = ['.'];
    const requested: string[] = [];
    const store = createRepoStore({
      fetch: async (url) => {
        requested.push(new URL(url, 'http://localhost').searchParams.get('rescan') ?? '');
        return { repos };
      },
    });

    const unsubscribe = store.subscribe('/ws/a', () => {});
    await store.settled('/ws/a');
    expect(store.snapshot('/ws/a')).toEqual({ repos: ['.'], scanning: false });

    // A nested repo that appeared after the first discovery.
    repos = ['.', 'projects/late'];
    store.rescan('/ws/a');
    await store.settled('/ws/a');

    expect(requested).toEqual(['', '1']);
    expect(store.snapshot('/ws/a')).toEqual({ repos: ['.', 'projects/late'], scanning: false });
    unsubscribe();
  });
});
