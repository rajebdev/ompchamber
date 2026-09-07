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

interface GitTreeItemProps {
  node: GitTreeNode;
  isStaged: boolean;
  isFolderOpen: (id: string) => boolean;
  toggleFolder: (id: string) => void;
  onAction: (actionType: string, file?: string) => void;
  depth?: number;
}

export function GitTreeItem({
  node,
  isStaged,
  isFolderOpen,
  toggleFolder,
  onAction,
  depth = 0,
}: GitTreeItemProps) {
  const isFolder = node.type === 'folder';
  const isOpen = isFolder ? isFolderOpen(node.id) : false;

  if (isFolder) {
    return (
      <div className="select-none">
        <div 
          className="flex items-center justify-between px-2 py-1 hover:bg-ink/5 cursor-pointer rounded group transition-colors text-[11px]"
          onClick={() => toggleFolder(node.id)}
        >
          <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-1">
            <span className="w-3.5 h-3.5 flex items-center justify-center text-ink/40 flex-shrink-0">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <FileIcon name={node.name} isFolder={true} isOpen={isOpen} size={13} className="flex-shrink-0" />
            <span className="font-medium text-ink truncate">{node.name}</span>
            <span className="text-[9px] text-ink/40 font-normal px-1 py-0.2 bg-ink/5 rounded-full ml-1">
              {node.changeCount}
            </span>
          </div>

          {/* Folder Level Actions */}
          <div className="flex items-center space-x-1 text-ink/40 flex-shrink-0">
            <div className="flex items-center opacity-0 group-hover:opacity-100 space-x-1">
              {!isStaged ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('revert', node.path);
                    }}
                    title={`Discard changes in ${node.name}`}
                    className="w-5 h-5 flex items-center justify-center rounded hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
                  >
                    <Undo2 size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('stage', node.path);
                    }}
                    title={`Stage ${node.name}`}
                    className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
                  >
                    <Plus size={11} />
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
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
                >
                  <Minus size={11} />
                </button>
              )}
            </div>
          </div>
        </div>

        {isOpen && node.children && node.children.length > 0 && (
          <div className="ml-3 border-l border-ink/10 pl-1">
            {node.children.map(child => (
              <GitTreeItem
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
  let colorClass = 'text-ink';

  if (change) {
    if (isStaged) {
      charStatus = change.status[0] || 'M';
      if (charStatus === 'A') colorClass = 'text-green-600';
      else if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-red-600';
    } else {
      if (change.status === '??') {
        charStatus = 'U';
        colorClass = 'text-green-600';
      } else {
        charStatus = change.status[1] || change.status[0] || 'M';
        if (charStatus === 'M') colorClass = 'text-blue-600';
        else if (charStatus === 'D') colorClass = 'text-red-600';
      }
    }
  }

  const filePath = change ? change.file : node.path;

  return (
    <div className="flex items-center justify-between px-2 py-0.5 hover:bg-ink/5 cursor-pointer rounded group transition-colors text-[11px]">
      <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-1">
        <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
          <span className={`font-bold font-mono text-[9px] ${colorClass}`} title={`Status: ${charStatus}`}>
            {charStatus}
          </span>
        </span>
        <FileIcon name={node.name} size={12} className="flex-shrink-0" />
        <span className={`truncate ${colorClass}`} title={filePath}>
          {node.name}
        </span>
      </div>

      <div className="flex items-center space-x-1 text-ink/40 flex-shrink-0">
        <div className="flex items-center opacity-0 group-hover:opacity-100 space-x-1">
          {!isStaged ? (
            <>
              <button
                type="button"
                onClick={() => onAction('revert', filePath)}
                title="Discard Changes"
                className="w-5 h-5 flex items-center justify-center rounded hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
              >
                <Undo2 size={11} />
              </button>
              <button
                type="button"
                onClick={() => onAction('stage', filePath)}
                title="Stage Changes"
                className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
              >
                <Plus size={11} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onAction('unstage', filePath)}
              title="Unstage Changes"
              className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
            >
              <Minus size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
