import { useState, useCallback } from 'react';
import type { GitCommit, GitCommitFile } from '@/types/git';

interface UseCommitInteractionsOptions {
  onExecuteAction?: (actionType: string, file?: string, extra?: Record<string, string>) => void;
  rootPath?: string;
  activeRepo?: string;
}

export function useCommitInteractions({
  onExecuteAction,
  rootPath,
  activeRepo,
}: UseCommitInteractionsOptions) {
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const handleToggleFile = useCallback(
    async (commitHash: string, file: GitCommitFile) => {
      const diffKey = `${commitHash}:${file.file}`;
      let isExpanding = false;

      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(diffKey)) {
          next.delete(diffKey);
          isExpanding = false;
        } else {
          next.add(diffKey);
          isExpanding = true;
        }
        return next;
      });

      if (isExpanding && fileDiffs[diffKey] === undefined && !file.diff) {
        setLoadingFiles((prev) => new Set(prev).add(diffKey));
        try {
          const formData = new FormData();
          formData.set('actionType', 'commit_diff');
          formData.set('hash', commitHash);
          formData.set('file', file.file);
          if (rootPath) formData.set('root', rootPath);
          if (activeRepo && activeRepo !== '.') formData.set('repo', activeRepo);

          const res = await fetch('/api/fs/git', { method: 'POST', body: formData });
          const json = await res.json();
          if (json && typeof json.diff === 'string') {
            setFileDiffs((prev) => ({ ...prev, [diffKey]: json.diff }));
          } else if (json && json.error) {
            setFileDiffs((prev) => ({ ...prev, [diffKey]: `// Error: ${json.error}` }));
          }
        } catch (err: any) {
          console.error('Failed to load file diff:', err);
          setFileDiffs((prev) => ({ ...prev, [diffKey]: `// Error loading diff: ${err?.message || 'Network error'}` }));
        } finally {
          setLoadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(diffKey);
            return next;
          });
        }
      }
    },
    [fileDiffs, rootPath, activeRepo]
  );

  const handleCommitAction = useCallback(
    (action: string, commit: GitCommit) => {
      if (!onExecuteAction) return;

      if (action === 'checkout') {
        onExecuteAction('checkout', undefined, { branch: commit.hash });
      } else if (action === 'create_branch_here') {
        const name = window.prompt(`Create new branch at commit ${commit.shortHash}:`, `branch-${commit.shortHash}`);
        if (name?.trim()) {
          onExecuteAction('create_branch', undefined, { branch: name.trim() });
        }
      } else if (action === 'cherry_pick') {
        if (window.confirm(`Cherry-pick commit ${commit.shortHash} onto current branch?`)) {
          onExecuteAction('cherry_pick', undefined, { hash: commit.hash });
        }
      } else if (action === 'revert') {
        if (window.confirm(`Revert commit ${commit.shortHash}?`)) {
          onExecuteAction('revert_commit', undefined, { hash: commit.hash });
        }
      } else if (action === 'reset') {
        const mode = window.prompt(`Reset current branch to ${commit.shortHash} (soft, mixed, hard):`, 'soft');
        if (mode && ['soft', 'mixed', 'hard'].includes(mode.toLowerCase())) {
          onExecuteAction('reset_commit', undefined, { hash: commit.hash, mode: mode.toLowerCase() });
        }
      } else if (action === 'merge') {
        if (window.confirm(`Merge commit ${commit.shortHash} into current branch?`)) {
          onExecuteAction('merge_commit', undefined, { hash: commit.hash });
        }
      } else if (action === 'rebase') {
        if (window.confirm(`Rebase current branch onto commit ${commit.shortHash}?`)) {
          onExecuteAction('rebase_commit', undefined, { hash: commit.hash });
        }
      }
    },
    [onExecuteAction]
  );

  return {
    fileDiffs,
    expandedFiles,
    loadingFiles,
    handleToggleFile,
    handleCommitAction,
  };
}
