import React from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Minus, 
  Undo2 
} from 'lucide-react';
import { FileIcon } from '../../common/FileIcon';
import type { GitTreeNode } from '@/types';

interface MobileGitTreeItemProps {
  node: GitTreeNode;
  isStaged: boolean;
  isFolderOpen: (id: string) => boolean;
  toggleFolder: (id: string) => void;
  onAction: (actionType: string, file?: string) => void;
  depth?: number;
}

export function MobileGitTreeItem({
  node,
  isStaged,
  isFolderOpen,
  toggleFolder,
  onAction,
  depth = 0,
}: MobileGitTreeItemProps) {
  const isFolder = node.type === 'folder';
  const isOpen = isFolder ? isFolderOpen(node.id) : false;

  if (isFolder) {
    return (
      <div className="select-none">
        <div 
          className="flex items-center justify-between py-1.5 px-2 hover:bg-ink/5 active:bg-ink/10 rounded cursor-pointer transition-colors text-xs"
          onClick={() => toggleFolder(node.id)}
        >
          <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-1">
            <span className="w-4 h-4 flex items-center justify-center text-ink/40 flex-shrink-0">
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
            <FileIcon name={node.name} isFolder={true} isOpen={isOpen} size={14} className="flex-shrink-0" />
            <span className="font-medium text-ink truncate">{node.name}</span>
            <span className="text-[10px] text-ink/40 font-normal px-1.5 py-0.5 bg-ink/5 rounded-full ml-1">
              {node.changeCount}
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0">
            {!isStaged ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('revert', node.path);
                  }}
                  title={`Discard ${node.name}`}
                  className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-error hover:bg-error/10 active:scale-95 transition-colors cursor-pointer"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('stage', node.path);
                  }}
                  title={`Stage ${node.name}`}
                  className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('unstage', node.path);
                }}
                title={`Unstage ${node.name}`}
                className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
              >
                <Minus size={13} />
              </button>
            )}
          </div>
        </div>

        {isOpen && node.children && node.children.length > 0 && (
          <div className="ml-3.5 border-l border-ink/10 pl-1">
            {node.children.map(child => (
              <MobileGitTreeItem
                key={child.id}
                node={child}
                isStaged={isStaged}
                isFolderOpen={isFolderOpen}
                toggleFolder={toggleFolder}
                onAction={onAction}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File Node
  const change = node.change;
  let charStatus = 'M';
  let colorClass = 'text-blue-600';

  if (change) {
    if (isStaged) {
      charStatus = change.status?.[0] || 'M';
      if (charStatus === 'A') colorClass = 'text-success';
      else if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-error';
    } else {
      if (change.status === '??') {
        charStatus = 'U';
        colorClass = 'text-success';
      } else {
        charStatus = change.status?.[1] || change.status?.[0] || 'M';
        if (charStatus === 'M') colorClass = 'text-blue-600';
        else if (charStatus === 'D') colorClass = 'text-error';
      }
    }
  }

  const filePath = change ? change.file : node.path;
  

  return (
    <div className="flex items-center justify-between py-1 px-2 hover:bg-ink/5 active:bg-ink/10 rounded cursor-pointer transition-colors text-xs">
      <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-1">
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          <span className={`font-bold font-mono text-[10px] ${colorClass}`} title={`Status: ${charStatus}`}>
            {charStatus}
          </span>
        </span>
        <FileIcon name={node.name} size={13} className="flex-shrink-0" />
        <span className={`truncate font-mono ${colorClass}`} title={filePath}>
          {node.name}
        </span>
      </div>

      <div className="flex items-center space-x-1 flex-shrink-0">
        {!isStaged ? (
          <>
            <button
              type="button"
              onClick={() => onAction('revert', filePath)}
              title="Discard change"
              className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-error hover:bg-error/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => onAction('stage', filePath)}
              title="Stage change"
              className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Plus size={13} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onAction('unstage', filePath)}
            title="Unstage change"
            className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
          >
            <Minus size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
