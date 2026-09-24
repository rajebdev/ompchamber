/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nested-repo discovery store, keyed by workspace root.
 *
 * The leak this module exists to prevent: a repo is a path RELATIVE to a root
 * (`projects/jns6_5/token` only names a directory under `~/JatisMobile/Workspace`),
 * so a list discovered for one workspace is meaningless under another. Keying
 * every entry by the root it was discovered for makes that structural — a new
 * root has no entry and starts from {@link UNKNOWN_LIST} instead of inheriting
 * the previous list.
 *
 * A store rather than a fetch per hook: the right-panel views ask the same
 * question about the same root, and independent copies meant one request per
 * panel per poll interval plus lists that could disagree.
 *
 * Both platform dependencies are injected — `fetch` and the retry scheduler —
 * so the invalidation rules are testable without a DOM and without wall-clock
 * timers.
 */

import { REPO_DISCOVERY_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { isRecord } from '@/shared/lib/util/guards';

export interface RepoListSnapshot {
  repos: string[];
  /** Discovery is still running server-side, or a forced rescan is. */
  scanning: boolean;
}

/** The list before discovery has answered: the workspace root alone. */
export const UNKNOWN_LIST: RepoListSnapshot = { repos: ['.'], scanning: false };

/** `fetch` seam: resolves the parsed `?reposOnly=1` payload, rejects on error. */
export type RepoFetch = (url: string) => Promise<unknown>;

/**
 * Retry seam. Runs `run` once after `delayMs` and returns a cancel; the default
 * is a one-shot timer, and the caller re-arms it per attempt.
 */
export type RepoScheduler = (run: () => void, delayMs: number) => () => void;

interface RootEntry {
  snapshot: RepoListSnapshot;
  /** True once a discovery response was accepted for this root. Drives the
   *  "start discovery on first subscriber" decision — object identity of
   *  `snapshot` cannot, because clearing the spinner mints a new one. */
  loaded: boolean;
  listeners: Set<() => void>;
  controller: AbortController | null;
  cancelRetry: (() => void) | null;
  /** The discovery currently in flight, so a caller can await its settlement. */
  pending: Promise<void> | null;
}

export interface RepoStore {
  /** Repos discovered for `root`; {@link UNKNOWN_LIST} until one is. */
  snapshot: (root: string) => RepoListSnapshot;
  /** Await the discovery in flight for `root` (a no-op when there is none). */
  settled: (root: string) => Promise<void>;
  /** Observe `root`; the first subscriber starts discovery. Returns a cancel. */
  subscribe: (root: string, listener: () => void) => () => void;
  /** Re-run discovery for `root` from scratch, ignoring any cached result. */
  rescan: (root: string) => void;
}

export interface RepoStoreOptions {
  fetch: RepoFetch;
  scheduler?: RepoScheduler;
}

const defaultScheduler: RepoScheduler = (run, delayMs) => {
  const id = setTimeout(run, delayMs);
  return () => clearTimeout(id);
};

export function createRepoStore({ fetch: fetchImpl, scheduler = defaultScheduler }: RepoStoreOptions): RepoStore {
  // Per-store, not module-level: two stores must not share state, and a test
  // store must not see the app store's roots.
  const entries = new Map<string, RootEntry>();

  function entryFor(root: string): RootEntry {
    let entry = entries.get(root);
    if (!entry) {
      entry = {
        snapshot: UNKNOWN_LIST,
        loaded: false,
        listeners: new Set(),
        controller: null,
        cancelRetry: null,
        pending: null,
      };
      entries.set(root, entry);
    }
    return entry;
  }

  function publish(root: string, patch: Partial<RepoListSnapshot>): void {
    const entry = entries.get(root);
    if (!entry) return;
    const next = { ...entry.snapshot, ...patch };
    if (next.repos === entry.snapshot.repos && next.scanning === entry.snapshot.scanning) return;
    entry.snapshot = next;
    for (const listener of entry.listeners) listener();
  }

  function cancelRetry(entry: RootEntry): void {
    entry.cancelRetry?.();
    entry.cancelRetry = null;
  }

  function load(root: string, rescan: boolean): Promise<void> {
    const entry = entryFor(root);
    // A newer load supersedes this one: its response must not overwrite what
    // the newer request is already about to replace.
    entry.controller?.abort();
    const controller = new AbortController();
    entry.controller = controller;
    publish(root, { scanning: true });

    const params = new URLSearchParams({ reposOnly: '1' });
    if (root) params.set('root', root);
    if (rescan) params.set('rescan', '1');
    params.set('t', String(Date.now()));

    const pending = (async () => {
      const data = await fetchImpl(`/api/fs/git?${params.toString()}`).catch(() => null);
      if (entry.controller !== controller) return;
      entry.controller = null;

      const repos = isRecord(data) && Array.isArray(data.repos) ? data.repos : null;
      if (!repos) {
        // A failed read leaves the snapshot as it was — for a root nobody has
        // successfully listed yet that is still `UNKNOWN_LIST`, so the next
        // subscriber retries instead of sitting on an empty list.
        publish(root, { scanning: false });
        return;
      }
      const scanning = isRecord(data) && data.reposPending === true;
      entry.loaded = true;
      publish(root, { repos: repos.filter((r): r is string => typeof r === 'string'), scanning });

      // Discovery runs in the background server-side — the loader returns at
      // once with `reposPending` — so retry until it settles.
      if (scanning) {
        cancelRetry(entry);
        entry.cancelRetry = scheduler(() => {
          entry.cancelRetry = null;
          if (entry.listeners.size === 0) return;
          void load(root, false);
        }, REPO_DISCOVERY_POLL_MS);
      } else {
        cancelRetry(entry);
      }
    })();

    entry.pending = pending;
    return pending;
  }

  function subscribe(root: string, listener: () => void): () => void {
    const entry = entryFor(root);
    entry.listeners.add(listener);
    // First subscriber for this root — or the first since everyone left —
    // starts (or resumes) discovery, unless a settled list is already known for
    // this same root: a right-panel view switch must not re-run the server's
    // `find`.
    if (entry.controller === null && entry.cancelRetry === null && (!entry.loaded || entry.snapshot.scanning)) {
      void load(root, false);
    }
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size > 0) return;
      // Nobody is showing this root's list any more: abandon the read in flight
      // and drop the retry. The snapshot keeps its `scanning` flag, so the next
      // subscriber resumes discovery rather than inheriting a spinner that
      // nothing is driving.
      entry.controller?.abort();
      entry.controller = null;
      cancelRetry(entry);
    };
  }

  return {
    snapshot: (root) => entries.get(root)?.snapshot ?? UNKNOWN_LIST,
    settled: (root) => entries.get(root)?.pending ?? Promise.resolve(),
    subscribe,
    rescan: (root) => void load(root, true),
  };
}

/** The app's single store, over the browser's `fetch` and real timers. */
export const repoStore = createRepoStore({
  fetch: async (url) => {
    const response = await fetch(url);
    return response.json();
  },
});
