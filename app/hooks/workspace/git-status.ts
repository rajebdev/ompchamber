import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GitChange } from '@/types/git';
import { buildGitStatusMaps } from '@/lib/fs/git-status';

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
  useEffect(() => {
    if (!enabled || !pollMs) return;
    const id = setInterval(loadGitStatus, pollMs);
    return () => clearInterval(id);
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
