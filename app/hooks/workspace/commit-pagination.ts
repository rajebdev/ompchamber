import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GitCommit } from '@/types/git';
import { SAMPLE_GIT_COMMITS } from '@/data/mock/git-commits';

interface UseCommitPaginationOptions {
  output: { title: string; data: any[]; hasMore?: boolean; total?: number } | null;
  isGraphMode: boolean;
  rootPath?: string;
  activeRepo?: string;
}

export function useCommitPagination({
  output,
  isGraphMode,
  rootPath,
  activeRepo,
}: UseCommitPaginationOptions) {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState<boolean>(output?.hasMore ?? (output?.data?.length === 50));
  const [totalCount, setTotalCount] = useState<number | undefined>(output?.total);

  // Normalize incoming commits or fallback to sample commits
  const initialCommits: GitCommit[] = useMemo(() => {
    const raw = output?.data || [];
    if (raw.length === 0) return SAMPLE_GIT_COMMITS;

    if (raw[0] && typeof raw[0] === 'object' && ('hash' in raw[0] || 'shortHash' in raw[0])) {
      return raw.map((c: any) => ({
        hash: c.hash || c.shortHash || 'unknown',
        shortHash: c.shortHash || (c.hash ? c.hash.slice(0, 8) : 'unknown'),
        author: c.author || 'Unknown',
        date: c.date || c.time || '',
        message: c.message || '',
        parents: Array.isArray(c.parents) ? c.parents : [],
        refs: Array.isArray(c.refs) ? c.refs : [],
        files: Array.isArray(c.files) ? c.files : [],
        lane: typeof c.lane === 'number' ? c.lane : undefined,
      }));
    }

    return SAMPLE_GIT_COMMITS;
  }, [output?.data]);

  const [commits, setCommits] = useState<GitCommit[]>(initialCommits);

  useEffect(() => {
    setCommits(initialCommits);
    setHasMore(output?.hasMore ?? (output?.data?.length === 50));
    if (typeof output?.total === 'number') setTotalCount(output.total);
  }, [initialCommits, output?.hasMore, output?.data?.length, output?.total]);

  // Load more commits (lazy loading)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const formData = new FormData();
      formData.set('actionType', isGraphMode ? 'graph' : 'history');
      formData.set('limit', '50');
      formData.set('skip', String(commits.length));
      if (rootPath) formData.set('root', rootPath);
      if (activeRepo) formData.set('repo', activeRepo);

      const res = await fetch('/api/fs/git', { method: 'POST', body: formData });
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        const nextBatch: GitCommit[] = json.data.map((c: any) => ({
          hash: c.hash || c.shortHash || 'unknown',
          shortHash: c.shortHash || (c.hash ? c.hash.slice(0, 8) : 'unknown'),
          author: c.author || 'Unknown',
          date: c.date || c.time || '',
          message: c.message || '',
          parents: Array.isArray(c.parents) ? c.parents : [],
          refs: Array.isArray(c.refs) ? c.refs : [],
          files: Array.isArray(c.files) ? c.files : [],
          lane: typeof c.lane === 'number' ? c.lane : undefined,
        }));

        setCommits((prev) => {
          const existing = new Set(prev.map((c) => c.hash));
          const fresh = nextBatch.filter((c) => !existing.has(c.hash));
          return [...prev, ...fresh];
        });

        setHasMore(Boolean(json.hasMore ?? (nextBatch.length === 50)));
        if (typeof json.total === 'number') setTotalCount(json.total);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more commits:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, isGraphMode, commits.length, rootPath, activeRepo]);

  return {
    commits,
    setCommits,
    hasMore,
    totalCount,
    isLoadingMore,
    handleLoadMore,
  };
}
