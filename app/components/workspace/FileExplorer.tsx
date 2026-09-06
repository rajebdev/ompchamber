import React, { useEffect, useState } from 'react';
import { Search, Folder, File as FileIcon, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { useFetcher } from '@remix-run/react';
import { FileContextMenu, FileDeleteModal, FileRenameModal, FileHistoryModal } from './file-explorer/FileModals';

export function FileExplorer({ className = '', onOpenFile, refreshKey = 0, onRefresh }: { className?: string, onOpenFile?: (file: any) => void, refreshKey?: number, onRefresh?: () => void }) {
  const fetcher = useFetcher<{ files: any[] }>();
  const [searchQuery, setSearchQuery] = useState('');

  const loadFiles = () => fetcher.load(`/api/fs/dir?t=${Date.now()}`);

  useEffect(() => {
    loadFiles();
  }, [refreshKey]);

  const rawFiles = fetcher.data?.files || [];
  const isLoading = fetcher.state === 'loading';

  // Recursive function to filter files and folders
  const getFilteredFiles = () => {
    if (!searchQuery.trim()) return rawFiles;

    const lowerQuery = searchQuery.toLowerCase();

    const filterNode = (node: any): any => {
      const isMatch = node.name.toLowerCase().includes(lowerQuery);

      if (node.type === 'folder') {
        const filteredChildren = (node.children || []).map(filterNode).filter(Boolean);
        
        if (isMatch || filteredChildren.length > 0) {
          return {
            ...node,
            children: isMatch && filteredChildren.length === 0 ? node.children : filteredChildren,
            forceExpanded: true
          };
        }
        return null;
      }

      return isMatch ? node : null;
    };

    return rawFiles.map(filterNode).filter(Boolean);
  };

  const files = getFilteredFiles();

  return (
    <div className={`flex flex-col h-full bg-[#faf8f3] ${className}`}>
      <div className="p-3 border-b border-[#141310]/10 flex items-center space-x-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#141310]/40" />
          <input 
            type="text" 
            placeholder="Search files..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f4f1ea] border border-[#141310]/20 rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#141310] transition-colors text-[#141310] placeholder-[#141310]/40"
          />
        </div>
        <button 
          onClick={onRefresh ? onRefresh : loadFiles}
          className="p-1.5 text-[#141310]/40 hover:text-[#141310] hover:bg-[#141310]/5 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-[#141310]/80" onContextMenu={(e) => e.preventDefault()}>
        {isLoading && files.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40">
            No files found
          </div>
        ) : (
          files.map(file => (
            <FileItem key={file.id} file={file} onOpenFile={onOpenFile} onActionComplete={loadFiles} />
          ))
        )}
      </div>
    </div>
  );
}

function FileItem({ file, onOpenFile, onActionComplete }: { file: any, onOpenFile?: (file: any) => void, onActionComplete: () => void }) {
  const [isOpen, setIsOpen] = useState(file.is_expanded === 1);
  const actionFetcher = useFetcher<any>();
  const [mounted, setMounted] = useState(false);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [renameValue, setRenameValue] = useState(file.path);
  
  useEffect(() => { setMounted(true); }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const closeMenu = () => setContextMenu(null);
      document.addEventListener('click', closeMenu);
      return () => document.removeEventListener('click', closeMenu);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (actionFetcher.state === 'idle' && actionFetcher.data) {
      if (actionFetcher.data.success) {
        if (!actionFetcher.data.type) {
          // If it was a mutation (delete/rename)
          setShowRenameModal(false);
          setShowDeleteModal(false);
          onActionComplete();
        }
      }
    }
  }, [actionFetcher.state, actionFetcher.data]);

  const actualIsOpen = file.forceExpanded !== undefined ? file.forceExpanded : isOpen;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (file.type === 'folder') {
      setIsOpen(!actualIsOpen);
      if (file.forceExpanded !== undefined) {
        file.forceExpanded = undefined;
      }
    } else {
      if (onOpenFile) {
        onOpenFile(file);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleAction = (actionType: string) => {
    setContextMenu(null);
    if (actionType === 'view') {
      if (onOpenFile) onOpenFile(file);
    } else if (actionType === 'explorer') {
      actionFetcher.submit({ actionType: 'open_explorer', path: file.path }, { method: 'post', action: '/api/fs/action' });
    } else if (actionType === 'copy_path') {
      navigator.clipboard.writeText('/app/applet/examples/' + file.path); // approx absolute path
    } else if (actionType === 'copy_relative') {
      navigator.clipboard.writeText(file.path);
    } else if (actionType === 'history') {
      setShowHistoryModal(true);
      actionFetcher.submit({ actionType: 'git_history', path: file.path }, { method: 'post', action: '/api/fs/action' });
    } else if (actionType === 'rename') {
      setRenameValue(file.path);
      setShowRenameModal(true);
    } else if (actionType === 'delete') {
      setShowDeleteModal(true);
    }
  };

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    actionFetcher.submit({ actionType: 'rename', path: file.path, newPath: renameValue }, { method: 'post', action: '/api/fs/action' });
  };

  const submitDelete = () => {
    actionFetcher.submit({ actionType: 'delete', path: file.path }, { method: 'post', action: '/api/fs/action' });
  };

  const isFolder = file.type === 'folder';

  return (
    <div>
      <div 
        className="flex items-center space-x-1.5 py-1 px-2 hover:bg-[#141310]/5 cursor-pointer rounded group"
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
      >
        {isFolder ? (
          actualIsOpen ? <ChevronDown size={12} className="text-[#141310]/40" /> : <ChevronRight size={12} className="text-[#141310]/40" />
        ) : (
          <span className="w-3"></span>
        )}
        
        {isFolder ? (
          <Folder size={12} className="text-[#141310]/60" />
        ) : (
          <FileIcon size={12} className="text-[#141310]/60" />
        )}
        <span className="truncate">{file.name}</span>
      </div>

      {actualIsOpen && file.children && file.children.length > 0 && (
        <div className="ml-3 border-l border-[#141310]/10 pl-1">
          {file.children.map((child: any) => (
            <FileItem key={child.id} file={child} onOpenFile={onOpenFile} onActionComplete={onActionComplete} />
          ))}
        </div>
      )}

      {/* Context Menu Portal */}
      {mounted && contextMenu && (
        <FileContextMenu 
          x={contextMenu.x}
          y={contextMenu.y}
          isFolder={isFolder}
          onAction={handleAction}
        />
      )}

      {/* Delete Modal */}
      {mounted && showDeleteModal && (
        <FileDeleteModal 
          fileName={file.name}
          isFolder={isFolder}
          isLoading={actionFetcher.state !== 'idle'}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={submitDelete}
        />
      )}

      {/* Rename Modal */}
      {mounted && showRenameModal && (
        <FileRenameModal 
          isFolder={isFolder}
          renameValue={renameValue}
          originalPath={file.path}
          isLoading={actionFetcher.state !== 'idle'}
          onChange={setRenameValue}
          onCancel={() => setShowRenameModal(false)}
          onSubmit={submitRename}
        />
      )}

      {/* History Modal */}
      {mounted && showHistoryModal && (
        <FileHistoryModal 
          filePath={file.path}
          fetcherState={actionFetcher.state}
          fetcherData={actionFetcher.data}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  );
}
