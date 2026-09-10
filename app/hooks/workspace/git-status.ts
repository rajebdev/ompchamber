import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GitChange } from '@/types/git';
import { buildGitStatusMaps } from '@/lib/fs/git-status';

export function useGitStatus(
  rootPath?: string,
  activeRepo: string = '.',
  refreshKey: number = 0,
  enabled: boolean = true
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
