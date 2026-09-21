import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GitChange } from '@/shared/types/git';
import { buildGitStatusMaps } from '@/shared/lib/fs/git-status';
import { useVisibilityRefresh } from '@/client/hooks/ui/visibility-refresh';
import { useChamberEvent, useDocumentEvent, useWindowEvent } from '@/client/hooks/ui/window-event';
import { GIT_STATUS_EVENT_THROTTLE_MS } from '@/shared/lib/workspace/refresh-cadence';

export function useGitStatus(
  rootPath?: string,
  activeRepo: string = '.',
  refreshKey: number = 0,
  enabled: boolean = true,
  pollMs: number = 0
) {
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadGitStatus = useCallback(() => {
    if (!enabled) return;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (rootPath) params.set('root', rootPath);
    if (activeRepo && activeRepo !== '.') params.set('repo', activeRepo);
    params.set('t', String(Date.now()));

    fetch(`/api/fs/git?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.changes)) {
          setChanges(data.changes);
        } else {
          setChanges([]);
        }
      })
      .catch(() => setChanges([]))
      .finally(() => setIsLoading(false));
  }, [enabled, rootPath, activeRepo]);

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
