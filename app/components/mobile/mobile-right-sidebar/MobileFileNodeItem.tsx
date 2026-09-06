import React, { useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FileText,
  ChevronRight, 
  ChevronDown
} from 'lucide-react';

export interface FileNode {
  name: string;
  path?: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
}

interface MobileFileNodeItemProps {
  node: FileNode;
  parentPath?: string;
  isOpen: boolean;
  onToggleFolder: (path: string) => void;
  onSelectFile: (file: { name: string; path?: string; content?: string }) => void;
  onContextMenu: (x: number, y: number, node: FileNode, fullPath: string) => void;
  openFolders: Record<string, boolean>;
  searchQuery: string;
}

export function MobileFileNodeItem({
  node,
  parentPath = '',
  isOpen,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  openFolders,
  searchQuery,
}: MobileFileNodeItemProps) {
  const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
  const isFolder = node.type === 'folder';
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, node, fullPath);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    touchTimerRef.current = setTimeout(() => {
      onContextMenu(clientX, clientY, node, fullPath);
    }, 450);
  };

  const clearTouchTimer = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  if (isFolder) {
    const isFolderOpen = searchQuery.trim() ? true : isOpen;

    return (
      <div className="select-none">
        <button
          type="button"
          onClick={() => onToggleFolder(fullPath)}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={clearTouchTimer}
          onTouchMove={clearTouchTimer}
          onTouchCancel={clearTouchTimer}
          className="w-full text-left flex items-center space-x-1.5 py-1 px-2 rounded-md hover:bg-[#141310]/5 transition-colors text-xs font-mono text-[#141310]/90"
        >
          {isFolderOpen ? (
            <ChevronDown size={13} className="text-[#141310]/50" />
          ) : (
            <ChevronRight size={13} className="text-[#141310]/50" />
          )}
          {isFolderOpen ? (
            <FolderOpen size={14} className="text-amber-700/80" />
          ) : (
            <Folder size={14} className="text-amber-700/80" />
          )}
          <span className="font-medium truncate">{node.name}</span>
        </button>

        {isFolderOpen && node.children && (
          <div className="pl-3.5 border-l border-[#141310]/10 ml-2 mt-0.5 space-y-0.5">
            {node.children.map(child => {
              const childPath = child.path || `${fullPath}/${child.name}`;
              return (
                <MobileFileNodeItem
                  key={childPath}
                  node={child}
                  parentPath={fullPath}
                  isOpen={!!openFolders[childPath]}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  onContextMenu={onContextMenu}
                  openFolders={openFolders}
                  searchQuery={searchQuery}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const isMd = node.name.endsWith('.md');

  return (
    <button
      type="button"
      onClick={() => onSelectFile({ name: node.name, path: fullPath, content: node.content })}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearTouchTimer}
      onTouchMove={clearTouchTimer}
      onTouchCancel={clearTouchTimer}
      className="w-full text-left flex items-center space-x-1.5 py-1 px-2 rounded-md hover:bg-[#141310]/5 transition-colors text-xs font-mono text-[#141310]/80 group"
    >
      {isMd ? (
        <FileText size={13} className="text-[#141310]/50 ml-3.5 flex-shrink-0" />
      ) : (
        <FileCode size={13} className="text-[#141310]/50 ml-3.5 flex-shrink-0" />
      )}
      <span className="truncate group-hover:text-[#141310]">{node.name}</span>
    </button>
  );
}
