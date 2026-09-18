import type { GitChange } from '@/shared/types';
import { useGitTree } from '@/client/hooks/workspace/git-tree';
import { GitTreeItem } from '@/client/components/workspace/git-panel/TreeItem';

interface GitTreeViewProps {
  changes: GitChange[];
  isStaged: boolean;
  repo?: string;
  rootPath?: string;
  onAction: (actionType: string, file?: string) => void;
}

export function GitTreeView({ changes, isStaged, repo, rootPath, onAction }: GitTreeViewProps) {
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
          repo={repo}
          rootPath={rootPath}
        />
      ))}
    </div>
  );
}
