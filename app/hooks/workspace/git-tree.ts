import { useMemo, useCallback, useEffect, useRef } from 'react';
import type { GitChange, GitTreeNode } from '@/types';
import { useSessionState, useSessionStateSnapshot } from '@/hooks/workspace/session-state';

export function buildGitTree(changes: GitChange[]): GitTreeNode[] {
  const root: GitTreeNode = {
    id: '',
    name: '',
    path: '',
    type: 'folder',
    children: [],
    changeCount: 0,
  };

  for (const change of changes) {
    const cleanPath = change.file.replace(/^[./]+/, '');
    const isExplicitDir = cleanPath.endsWith('/');
    const parts = cleanPath.replace(/\/$/, '').split('/').filter(Boolean);

    let current = root;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isFile = isLast && !isExplicitDir;

      if (isFile) {
        current.children.push({
          id: accumulatedPath,
          name: part,
          path: accumulatedPath,
          type: 'file',
          change,
          children: [],
          changeCount: 1,
        });
      } else {
        let folder = current.children.find(
          c => c.type === 'folder' && c.name === part
        );
        if (!folder) {
          folder = {
            id: accumulatedPath,
            name: part,
            path: accumulatedPath,
            type: 'folder',
            children: [],
            changeCount: 0,
            change: isLast && isExplicitDir ? change : undefined,
          };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  function calculateAndSort(node: GitTreeNode): number {
    if (node.type === 'file') return 1;

    let total = node.change ? 1 : 0;
    for (const child of node.children) {
      total += calculateAndSort(child);
    }
    node.changeCount = total;

    node.children.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

    return total;
  }

  calculateAndSort(root);
  return root.children;
}

export function useGitTree(changes: GitChange[]) {
  const { sessionId, ready, read } = useSessionStateSnapshot();
  const tree = useMemo(() => buildGitTree(changes), [changes]);

  // Collect all folder IDs
  const allFolderIds = useMemo(() => {
    const ids = new Set<string>();
    function collect(nodes: GitTreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          ids.add(node.id);
          if (node.children && node.children.length > 0) {
            collect(node.children);
          }
        }
      }
    }
    collect(tree);
    return ids;
  }, [tree]);

  // Persisted per-session expansion. A `Set` does not survive JSON, so the
  // stored value is a string[] and the Set is derived for O(1) lookups.
  const [expandedFolderList, setExpandedFolders] = useSessionState<string[]>('git.expandedFolders', []);
  const expandedFolders = useMemo(() => new Set(expandedFolderList), [expandedFolderList]);

  // One auto-expand pass per session: when the session carries no stored
  // selection (or a stored empty one) every folder opens; a restored non-empty
  // selection wins. `read` inspects the hydrated blob directly so the previous
  // session's value never leaks into a fresh one during the restore render.
  const seededSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || seededSessionRef.current === sessionId) return;
    if (allFolderIds.size === 0) return;
    seededSessionRef.current = sessionId;
    if (read<string[]>('git.expandedFolders', []).length > 0) return;
    setExpandedFolders(Array.from(allFolderIds));
  }, [ready, sessionId, allFolderIds, read, setExpandedFolders]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return Array.from(next);
    });
  }, [setExpandedFolders]);

  const isFolderOpen = useCallback(
    (folderId: string) => expandedFolders.has(folderId),
    [expandedFolders]
  );

  return {
    tree,
    expandedFolders,
    toggleFolder,
    isFolderOpen,
    expandAll: () => setExpandedFolders(Array.from(allFolderIds)),
    collapseAll: () => setExpandedFolders([]),
  };
}
