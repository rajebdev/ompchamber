import { useMemo, useState, useCallback, useEffect } from 'react';
import type { GitChange, GitTreeNode } from '@/types';

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

  // Default: all folders expanded
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(allFolderIds);

  // Auto-expand new folders when changes change
  useEffect(() => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      for (const id of allFolderIds) {
        next.add(id);
      }
      return next;
    });
  }, [allFolderIds]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const isFolderOpen = useCallback(
    (folderId: string) => expandedFolders.has(folderId),
    [expandedFolders]
  );

  return {
    tree,
    expandedFolders,
    toggleFolder,
    isFolderOpen,
    expandAll: () => setExpandedFolders(new Set(allFolderIds)),
    collapseAll: () => setExpandedFolders(new Set()),
  };
}
