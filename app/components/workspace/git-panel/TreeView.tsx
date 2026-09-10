import type { GitChange } from '@/types';
import { useGitTree } from '@/hooks/workspace/git-tree';
import { GitTreeItem } from '@/components/workspace/git-panel/TreeItem';

interface GitTreeViewProps {
  changes: GitChange[];
  isStaged: boolean;
  onAction: (actionType: string, file?: string) => void;
}

export function GitTreeView({ changes, isStaged, onAction }: GitTreeViewProps) {
  const { tree, isFolderOpen, toggleFolder } = useGitTree(changes);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="py-0.5">
      {tree.map(node => (
        <GitTreeItem
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
