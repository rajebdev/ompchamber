import React from 'react';
import type { GitChange } from '@/types';
import { useGitTree } from '@/hooks/useGitTree';
import { MobileGitTreeItem } from './MobileGitTreeItem';

interface MobileGitTreeViewProps {
  changes: GitChange[];
  isStaged: boolean;
  onAction: (actionType: string, file?: string) => void;
}

export function MobileGitTreeView({ changes, isStaged, onAction }: MobileGitTreeViewProps) {
  const { tree, isFolderOpen, toggleFolder } = useGitTree(changes);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="py-1 px-1">
      {tree.map(node => (
        <MobileGitTreeItem
          key={node.id}
          node={node}
          isStaged={isStaged}
          isFolderOpen={isFolderOpen}
          toggleFolder={toggleFolder}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
