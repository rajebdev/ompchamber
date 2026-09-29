/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads the wiki behind the repository the right-panel scope points at.
 *
 * Two reads, both scope-tagged:
 *
 *   - the TREE (`GET /api/wiki`) — provider, revision, and every path in the
 *     wiki, which is also what a page's own links resolve against;
 *   - one PAGE (`GET /api/wiki/page`) — markdown source for the selection.
 *
 * Tagging is not decoration here. The scope is `root\0repo`, and a repository
 * switch changes WHICH wiki is being read: a page list or a page body that lands
 * after the switch describes a wiki the panel is no longer showing, and
 * rendering it under the new repo's header would attribute one project's
 * documentation to another.
 *
 * The poll is cheap because the server caches its mirror for a minute: a 5s tick
 * re-lists a local repository rather than re-fetching the remote, and only the
 * user's own Refresh forces a fetch.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import type { WikiPagePayload, WikiRepoPayload } from '@/shared/types/wiki';

/** `root\0repo` — the working tree a wiki read belongs to. */
export function wikiScopeKey(rootPath: string | undefined, repo: string): string {
  return `${rootPath ?? ''}\u0000${repo}`;
}

function wikiParams(rootPath: string | undefined, repo: string): URLSearchParams {
  const params = new URLSearchParams();
  if (rootPath) params.set('root', rootPath);
  if (repo && repo !== '.') params.set('repo', repo);
  return params;
}

export interface WikiScopeArgs {
  rootPath: string | undefined;
  /** The shared repo pick, relative to `rootPath`. */
  repo: string;
  /** False when the view cannot read at all (no active workspace). */
  enabled: boolean;
  /** False while the view is hidden; pauses the poll. */
  active: boolean;
}

export interface WikiTreeState {
  data: WikiRepoPayload | null;
  isLoading: boolean;
  /** Set when the last read failed; the previous payload is kept meanwhile. */
  error: string | null;
  /** `force` bypasses the server's mirror cache — the panel's own Refresh. */
  reload: (opts?: { force?: boolean }) => void;
}

export function useWikiTree(
  args: WikiScopeArgs & {
    /** Bumped by a workspace refresh, so a write anywhere re-lists the wiki. */
    revisionKey?: number;
  },
): WikiTreeState {
  const { rootPath, repo, enabled, active, revisionKey = 0 } = args;
  const scope = wikiScopeKey(rootPath, repo);
  const [state, setState] = useState<{ scope: string; data: WikiRepoPayload | null }>({ scope, data: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const load = useCallback(
    (opts?: { force?: boolean }) => {
      if (!enabled) return;
      const requested = scopeRef.current;
      const request = ++requestRef.current;
      setIsLoading(true);
      const params = wikiParams(rootPath, repo);
      if (opts?.force) params.set('refresh', '1');
      params.set('t', String(Date.now()));
      fetch(`/api/wiki?${params.toString()}`)
        .then(async (response) => {
          const payload = (await response.json()) as WikiRepoPayload & { error?: string };
          if (!response.ok) throw new Error(payload?.error || `Wiki request failed (${response.status})`);
          return payload;
        })
        .then((payload) => {
          if (requestRef.current !== request) return;
          setState({ scope: requested, data: payload });
          setError(null);
        })
        .catch((err: unknown) => {
          if (requestRef.current !== request) return;
          setError(err instanceof Error ? err.message : 'Failed to load the wiki');
        })
        .finally(() => {
          if (requestRef.current === request) setIsLoading(false);
        });
    },
    [enabled, rootPath, repo],
  );

  // A scope switch is a different wiki: drop the previous one's tree before the
  // new read lands, or the page list would briefly describe another project.
  useEffect(() => {
    setState({ scope, data: null });
    setError(null);
  }, [scope]);

  useEffect(() => {
    load();
  }, [load, revisionKey]);

  usePanelRefresh(load, enabled && active);

  return {
    data: state.scope === scope ? state.data : null,
    isLoading,
    error,
    reload: load,
  };
}

export interface WikiPageState {
  data: WikiPagePayload | null;
  isLoading: boolean;
  error: string | null;
}

export function useWikiPage(
  args: WikiScopeArgs & {
    /** Page to read; null when the wiki has no selection yet. */
    path: string | null;
    /** Bumped after a forced tree re-fetch, so the body follows a moved ref. */
    revisionKey?: number;
  },
): WikiPageState {
  const { rootPath, repo, path, enabled, active, revisionKey = 0 } = args;
  const scope = `${wikiScopeKey(rootPath, repo)}\u0000${path ?? ''}`;
  const [state, setState] = useState<{ scope: string; data: WikiPagePayload | null }>({ scope, data: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !active || !path) {
      setState({ scope, data: null });
      setError(null);
      return;
    }
    const request = ++requestRef.current;
    setIsLoading(true);
    const params = wikiParams(rootPath, repo);
    params.set('path', path);
    fetch(`/api/wiki/page?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json()) as WikiPagePayload & { error?: string };
        if (!response.ok) throw new Error(payload?.error || `Page request failed (${response.status})`);
        return payload;
      })
      .then((payload) => {
        if (requestRef.current !== request) return;
        setState({ scope, data: payload });
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestRef.current !== request) return;
        setError(err instanceof Error ? err.message : 'Failed to load the page');
      })
      .finally(() => {
        if (requestRef.current === request) setIsLoading(false);
      });
  }, [scope, rootPath, repo, path, enabled, active, revisionKey]);

  return {
    data: state.scope === scope ? state.data : null,
    isLoading,
    error,
  };
}
