import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GitChange } from '@/shared/types/git';
import { buildGitStatusMaps } from '@/shared/lib/fs/git-status';
import { useVisibilityRefresh } from '@/client/hooks/ui/visibility-refresh';
import { useChamberEvent, useDocumentEvent, useWindowEvent } from '@/client/hooks/ui/window-event';
import { GIT_STATUS_EVENT_THROTTLE_MS } from '@/shared/lib/workspace/refresh-cadence';

/** Shared empty list, so a clean tree keeps one array identity across renders. */
const NO_CHANGES: GitChange[] = [];

export function useGitStatus(
  rootPath?: string,
  activeRepo: string = '.',
  refreshKey: number = 0,
  enabled: boolean = true,
  pollMs: number = 0
) {
  // The tree these changes describe. A response and the state it fills are both
  // tagged with it, so a read that lands after the scope moved can never be
  // rendered as the new scope's: the activity bar's dot would then describe the
  // previous repository for as long as the new read takes.
  const scope = `${rootPath ?? ''}\u0000${activeRepo}`;
  const [state, setState] = useState<{ scope: string; changes: GitChange[] }>({ scope, changes: NO_CHANGES });
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef(0);

  // A new scope is a new tree — and it may be a REVISIT (root → repo → root),
  // where the scope string matches while the changes held are from the earlier
  // visit. Drop them before rendering.
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    setState({ scope, changes: NO_CHANGES });
  }

  const loadGitStatus = useCallback(() => {
    if (!enabled) return;
    const request = ++requestRef.current;
    const requested = scope;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (rootPath) params.set('root', rootPath);
    if (activeRepo && activeRepo !== '.') params.set('repo', activeRepo);
    params.set('t', String(Date.now()));

    fetch(`/api/fs/git?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        // Superseded by a newer read: this one describes a tree nobody is on.
        if (requestRef.current !== request) return;
        setState({ scope: requested, changes: Array.isArray(data.changes) ? data.changes : NO_CHANGES });
      })
      .catch(() => {
        if (requestRef.current !== request) return;
        setState({ scope: requested, changes: NO_CHANGES });
      })
      .finally(() => setIsLoading(false));
  }, [enabled, rootPath, activeRepo, scope]);

  useEffect(() => {
    loadGitStatus();
  }, [loadGitStatus, refreshKey]);

  // Optional background polling so indicators stay fresh after external
  // actions (terminal commits, agent edits) that never bump `refreshKey`.
  // Ticks pause while the document is hidden and re-check on visibility —
  // a background tab cannot show the dot, so the poll would be wasted wakeups.
  useVisibilityRefresh(loadGitStatus, { enabled, intervalMs: pollMs });

  // Re-check when the tab regains focus (covers most post-commit cases).
  useWindowEvent('focus', () => {
    if (enabled) loadGitStatus();
  });
  useDocumentEvent('visibilitychange', () => {
    if (enabled) loadGitStatus();
  });

  // An agent run rewrites the working tree, and a workspace binding change
  // re-roots it — both are worth a re-read without waiting out the poll.
  // Coalesced through one trailing timer: a run emits `omp:session-updated`
  // more than once and every instance of this hook listens, so firing per event
  // would spawn several `git status` processes for a single run.
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleEventRefresh = useCallback(() => {
    if (!enabled || eventTimerRef.current !== undefined) return;
    eventTimerRef.current = setTimeout(() => {
      eventTimerRef.current = undefined;
      loadGitStatus();
    }, GIT_STATUS_EVENT_THROTTLE_MS);
  }, [enabled, loadGitStatus]);

  useEffect(() => () => {
    if (eventTimerRef.current !== undefined) clearTimeout(eventTimerRef.current);
  }, []);

  useChamberEvent('omp:session-updated', scheduleEventRefresh);
  useChamberEvent('omp:workspace-updated', scheduleEventRefresh);

  // Nothing is rendered from another scope: `state.changes` is tagged with the
  // tree it was read from, and the scope on screen may have moved since.
  const changes = state.scope === scope ? state.changes : NO_CHANGES;

  const { fileMap, folderMap } = useMemo(() => {
    return buildGitStatusMaps(changes);
  }, [changes]);

  return {
    changes,
    fileMap,
    folderMap,
    isLoading,
    refreshGitStatus: loadGitStatus,
  };
}
