import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { GitChange } from '@/shared/types/git';
import { buildGitStatusMaps } from '@/shared/lib/fs/git-status';

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
  useEffect(() => {
    if (!enabled || !pollMs) return;
    let visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const id = setInterval(() => {
      if (visible) loadGitStatus();
    }, pollMs);
    const onVisibility = () => {
      const next = document.visibilityState === 'visible';
      if (next && !visible) loadGitStatus();
      visible = next;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, pollMs, loadGitStatus]);

  // Re-check when the tab regains focus (covers most post-commit cases).
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => loadGitStatus();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled, loadGitStatus]);

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
