import React, { useEffect, useState, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { FileIcon } from '../common/FileIcon';
import { useFetcher } from '@remix-run/react';
import { FileContextMenu, FileDeleteModal, FileRenameModal, FileHistoryModal } from './file-explorer/FileModals';

function setChildrenAt(nodes: any[], path: string, children: any[]): any[] {
  return nodes.map(node => {
    if (node.path === path) return { ...node, children, is_expanded: 1 };
    if (Array.isArray(node.children)) {
      const nested = setChildrenAt(node.children, path, children);
      if (nested !== node.children) return { ...node, children: nested };
    }
    return node;
  });
}

// After a refresh the API returns folders with `children: null`. Re-attach the
// children we already loaded and keep the expand/collapse state so a refresh
// never collapses expanded folders or forces a re-fetch on toggle.
function rehydrateTree(nodes: any[], cache: Record<string, any[]>, expanded: Set<string>): any[] {
  return nodes.map(node => {
    if (node.type !== 'folder') return node;
    const cached = cache[node.path];
    const wasExpanded = expanded.has(node.path);
    if (cached) {
      return {
        ...node,
        children: rehydrateTree(cached, cache, expanded),
        is_expanded: wasExpanded ? 1 : 0,
      };
    }
    return node;
  });
}

export function FileExplorer({ className = '', enabled = true, rootPath, onOpenFile, refreshKey = 0, onRefresh }: { className?: string, enabled?: boolean, rootPath?: string, onOpenFile?: (file: any) => void, refreshKey?: number, onRefresh?: () => void }) {
  const [tree, setTree] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const childrenCacheRef = useRef<Record<string, any[]>>({});

  const loadFiles = () => {
    if (!enabled) return;
    setIsLoading(true);
    const rootQuery = rootPath ? `&root=${encodeURIComponent(rootPath)}` : '';
    fetch(`/api/fs/dir?t=${Date.now()}${rootQuery}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.files)) {
          setTree(rehydrateTree(data.files, childrenCacheRef.current, expandedPaths));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadFiles();
  }, [refreshKey, rootPath, enabled]);

  const loadChildren = (path: string) => {
    const rootQuery = rootPath ? `&root=${encodeURIComponent(rootPath)}` : '';
    return fetch(`/api/fs/dir?path=${encodeURIComponent(path)}&t=${Date.now()}${rootQuery}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.files)) {
          childrenCacheRef.current[path] = data.files;
          setTree(prev => setChildrenAt(prev, path, data.files));
        }
      })
      .catch(() => {});
  };

  const handleToggleFolder = (path: string, open: boolean) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

  // Recursive filter over the currently-loaded tree
  const getFilteredFiles = () => {
    if (!searchQuery.trim()) return tree;

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

    return tree.map(filterNode).filter(Boolean);
  };

  const files = getFilteredFiles();

  return (
    <div className={`flex flex-col h-full bg-paper ${className}`}>
      <div className="p-3 border-b border-ink/10 flex items-center space-x-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-canvas border border-ink/20 rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-ink transition-colors text-ink placeholder-ink/40"
          />
        </div>
        <button
          onClick={onRefresh ? onRefresh : loadFiles}
          className="p-1.5 text-ink/40 hover:text-ink hover:bg-ink/5 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-ink/80" onContextMenu={(e) => e.preventDefault()}>
        {isLoading && files.length === 0 ? (
          <div className="p-4 text-center text-ink/40">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-ink/40">
            No files found
          </div>
        ) : (
          files.map(file => (
            <FileItem key={file.id} file={file} rootPath={rootPath} onLoadChildren={loadChildren} onOpenFile={onOpenFile} onActionComplete={loadFiles} expandedPaths={expandedPaths} onToggleFolder={handleToggleFolder} />
          ))
        )}
      </div>
    </div>
  );
}

function FileItem({ file, rootPath, onLoadChildren, onOpenFile, onActionComplete, expandedPaths, onToggleFolder }: { file: any, rootPath?: string, onLoadChildren?: (path: string) => Promise<void>, onOpenFile?: (file: any) => void, onActionComplete: () => void, expandedPaths?: Set<string>, onToggleFolder?: (path: string, open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(file.is_expanded === 1);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const actionFetcher = useFetcher<any>();
  const [mounted, setMounted] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [renameValue, setRenameValue] = useState(file.path);

  const isFolder = file.type === 'folder';
  const children = Array.isArray(file.children) ? file.children : [];

  useEffect(() => { setMounted(true); }, []);

  // Keep local open state in sync with the parent's expanded folder set so a
  // refresh (which rebuilds the tree) never silently collapses an open folder.
  useEffect(() => {
    if (isFolder && expandedPaths) {
      setIsOpen(expandedPaths.has(file.path));
    }
  }, [expandedPaths, file.path, isFolder]);

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
    if (isFolder) {
      const next = !actualIsOpen;
      setIsOpen(next);
      if (file.forceExpanded !== undefined) {
        file.forceExpanded = undefined;
      }
      onToggleFolder?.(file.path, next);
      if (next && onLoadChildren) {
        setIsLoadingChildren(true);
        Promise.resolve(onLoadChildren(file.path)).finally(() => setIsLoadingChildren(false));
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
      actionFetcher.submit({ actionType: 'open_explorer', path: file.path, ...(rootPath ? { root: rootPath } : {}) }, { method: 'post', action: '/api/fs/action' });
    } else if (actionType === 'copy_path') {
      navigator.clipboard.writeText('/app/applet/examples/' + file.path); // approx absolute path
    } else if (actionType === 'copy_relative') {
      navigator.clipboard.writeText(file.path);
    } else if (actionType === 'history') {
      setShowHistoryModal(true);
      actionFetcher.submit({ actionType: 'git_history', path: file.path, ...(rootPath ? { root: rootPath } : {}) }, { method: 'post', action: '/api/fs/action' });
    } else if (actionType === 'rename') {
      setRenameValue(file.path);
      setShowRenameModal(true);
    } else if (actionType === 'delete') {
      setShowDeleteModal(true);
    }
  };

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    actionFetcher.submit({ actionType: 'rename', path: file.path, newPath: renameValue, ...(rootPath ? { root: rootPath } : {}) }, { method: 'post', action: '/api/fs/action' });
  };

  const submitDelete = () => {
    actionFetcher.submit({ actionType: 'delete', path: file.path, ...(rootPath ? { root: rootPath } : {}) }, { method: 'post', action: '/api/fs/action' });
  };

  return (
    <div>
      <div
        className="flex items-center space-x-1.5 py-1 px-2 hover:bg-ink/5 cursor-pointer rounded group"
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
      >
        {isFolder ? (
          actualIsOpen ? <ChevronDown size={12} className="flex-shrink-0 text-ink/40" /> : <ChevronRight size={12} className="flex-shrink-0 text-ink/40" />
        ) : (
          <span className="w-3 flex-shrink-0"></span>
        )}

        <FileIcon name={file.name} isFolder={isFolder} isOpen={actualIsOpen} size={12} className="flex-shrink-0" />
        <span className="truncate min-w-0 flex-1">{file.name}</span>
      </div>

      {actualIsOpen && isLoadingChildren && (
        <div className="ml-3 border-l border-ink/10 pl-3 py-0.5 text-[10px] text-ink/30">Loading…</div>
      )}

      {actualIsOpen && !isLoadingChildren && children.length > 0 && (
        <div className="ml-3 border-l border-ink/10 pl-1">
          {children.map((child: any) => (
            <FileItem key={child.id} file={child} rootPath={rootPath} onLoadChildren={onLoadChildren} onOpenFile={onOpenFile} onActionComplete={onActionComplete} expandedPaths={expandedPaths} onToggleFolder={onToggleFolder} />
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
