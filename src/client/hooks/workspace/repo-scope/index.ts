/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nested-repo scope for the right-panel views (files, search, git, terminal).
 *
 * Every one of them needs the same two things, and both are meaningless without
 * the workspace root they describe:
 *
 *   - WHICH repo the view operates on (`useRepoScope`). A repo is a path
 *     relative to the active root — `projects/jns6_5/token` only names a
 *     directory under `~/JatisMobile/Workspace` — so a choice is only valid
 *     next to the root it was made under.
 *   - WHAT repos exist under that root (`useRepoList`), discovered server-side
 *     and stored with the root it was discovered for (see `./store`).
 *
 * Kept as bare per-panel values, both outlived the workspace they belonged to:
 * after a workspace switch the picker still listed the previous workspace's
 * repos, still showed one of them as the selection, and every request the panel
 * made named a path that did not exist under the new root. Pairing each value
 * with its root invalidates it by construction — no reset effect to order
 * against the per-session state restore — while a session returned to inside
 * the same workspace keeps the repo it was left on.
 */

import { useCallback, useRef, useSyncExternalStore } from 'preact/compat';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { repoStore, UNKNOWN_LIST } from '@/client/hooks/workspace/repo-scope/store';

/** A repo choice, kept next to the workspace root it was made under. */
interface RepoPick {
  root: string;
  repo: string;
}

/**
 * The repo a git panel works on: the user's pick, or — when they have none and
 * the workspace root is not itself a repo — the first repo discovery found.
 *
 * The git loader applies the same fallback when it is sent no repo at all
 * (`repo = repos.includes('.') ? '.' : repos[0]`), so resolving it here is what
 * keeps the header label, the picker's checkmark and the requests all naming
 * the repo git is actually operating on. Only git resolves it: browsing the
 * workspace root is legitimate even when that root is not a repo — a folder of
 * nested repos is a normal workspace — so the files, search and terminal panels
 * keep `'.'` as the root itself.
 */
export function resolveRepoForPanel(pick: string, repos: readonly string[]): string {
  if (pick !== '.' || repos.includes('.')) return pick;
  return repos[0] ?? '.';
}

/**
 * The repo this panel operates on, restored per session but dropped the moment
 * the active workspace root changes.
 */
export function useRepoScope(
  rootPath: string | undefined,
  stateKey: string,
): { activeRepo: string; setActiveRepo: (repo: string) => void; ready: boolean } {
  const [pick, setPick, ready] = useSessionState<RepoPick | null>(stateKey, null);
  const scope = rootPath ?? '';

  // Read through refs so the setter keeps ONE identity: it is handed to child
  // components and used in effect dependencies, and `useSessionState` mints a
  // fresh setter per render.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const setPickRef = useRef(setPick);
  setPickRef.current = setPick;
  const setActiveRepo = useCallback((repo: string) => {
    setPickRef.current({ root: scopeRef.current, repo });
  }, []);

  // A pick made under another root (or stored before the root was recorded
  // alongside it) names a directory that need not exist here: fall back to the
  // workspace root.
  const activeRepo =
    pick && typeof pick === 'object' && pick.root === scope && typeof pick.repo === 'string' && pick.repo
      ? pick.repo
      : '.';

  return { activeRepo, setActiveRepo, ready };
}

export interface RepoListHandle {
  /** Repos of the active root; the workspace root alone until discovery answers. */
  repos: string[];
  /** Discovery is still running — the server said so, or a rescan is in flight. */
  scanning: boolean;
  /** Re-run discovery from scratch (the picker's refresh button). */
  rescan: () => void;
}

/**
 * Discovered repos of the active root.
 *
 * @param active - when false nothing is subscribed; a hidden panel has no use
 *   for a list that costs the server a `find` over the workspace.
 */
export function useRepoList(rootPath: string | undefined, active: boolean): RepoListHandle {
  const scope = rootPath ?? '';
  const subscribe = useCallback(
    (listener: () => void) => (active ? repoStore.subscribe(scope, listener) : () => {}),
    [scope, active],
  );
  const getSnapshot = useCallback(
    () => (active ? repoStore.snapshot(scope) : UNKNOWN_LIST),
    [scope, active],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const rescan = useCallback(() => {
    if (active) repoStore.rescan(scope);
  }, [scope, active]);

  return { repos: snapshot.repos, scanning: snapshot.scanning, rescan };
}
