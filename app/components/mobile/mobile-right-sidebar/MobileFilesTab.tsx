import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, X } from 'lucide-react';
import { MobileFullEditor } from './MobileFullEditor';
import { MobileFileNodeItem, type FileNode } from './MobileFileNodeItem';
import { 
  FileContextMenu, 
  FileDeleteModal, 
  FileRenameModal, 
  FileHistoryModal 
} from '@/components/workspace/file-explorer/FileModals';

const fallbackTree: FileNode[] = [
  {
    name: 'app',
    path: 'app',
    type: 'folder',
    children: [
      {
        name: 'components',
        path: 'app/components',
        type: 'folder',
        children: [
          {
            name: 'mobile',
            path: 'app/components/mobile',
            type: 'folder',
            children: [
              { name: 'MobileLayoutWrapper.tsx', path: 'app/components/mobile/MobileLayoutWrapper.tsx', type: 'file' },
              { name: 'MobileMainView.tsx', path: 'app/components/mobile/MobileMainView.tsx', type: 'file' },
              { name: 'MobileRightSidebar.tsx', path: 'app/components/mobile/MobileRightSidebar.tsx', type: 'file' },
              { name: 'MobileSessionSidebar.tsx', path: 'app/components/mobile/MobileSessionSidebar.tsx', type: 'file' }
            ]
          },
          {
            name: 'workspace',
            path: 'app/components/workspace',
            type: 'folder',
            children: [
              { name: 'Editor.tsx', path: 'app/components/workspace/Editor.tsx', type: 'file' },
              { name: 'FileExplorer.tsx', path: 'app/components/workspace/FileExplorer.tsx', type: 'file' },
              { name: 'GitPanel.tsx', path: 'app/components/workspace/GitPanel.tsx', type: 'file' },
              { name: 'SearchPanel.tsx', path: 'app/components/workspace/SearchPanel.tsx', type: 'file' }
            ]
          }
        ]
      },
      {
        name: 'routes',
        path: 'app/routes',
        type: 'folder',
        children: [
          { name: '_index.tsx', path: 'app/routes/_index.tsx', type: 'file' }
        ]
      }
    ]
  },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'AGENTS.md', path: 'AGENTS.md', type: 'file' },
  { name: 'README.md', path: 'README.md', type: 'file' }
];

export function MobileFilesTab() {
  const [tree, setTree] = useState<FileNode[]>(fallbackTree);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    'app': true,
    'app/components': true,
    'app/components/mobile': true
  });
  const [selectedFileForEditor, setSelectedFileForEditor] = useState<{ name: string; path?: string; content?: string } | null>(null);

  // Context menu and modals state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode; path: string } | null>(null);
  const [modalTarget, setModalTarget] = useState<{ name: string; path: string; isFolder: boolean } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchFiles = () => {
    setIsLoading(true);
    fetch(`/api/fs/dir?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.files && Array.isArray(data.files) && data.files.length > 0) {
          setTree(data.files);
        } else {
          setTree(fallbackTree);
        }
      })
      .catch(() => {
        setTree(fallbackTree);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const toggleFolder = (path: string) => {
    setOpenFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const filterNode = (node: FileNode): FileNode | null => {
    if (!searchQuery.trim()) return node;
    const q = searchQuery.toLowerCase();
    const isMatch = node.name.toLowerCase().includes(q);

    if (node.type === 'folder') {
      const filteredChildren = (node.children || [])
        .map(filterNode)
        .filter(Boolean) as FileNode[];

      if (isMatch || filteredChildren.length > 0) {
        return {
          ...node,
          children: isMatch && filteredChildren.length === 0 ? node.children : filteredChildren
        };
      }
      return null;
    }

    return isMatch ? node : null;
  };

  const displayedTree = tree.map(filterNode).filter(Boolean) as FileNode[];

  const handleOpenContextMenu = (x: number, y: number, node: FileNode, fullPath: string) => {
    setContextMenu({ x, y, node, path: fullPath });
  };

  const handleAction = (actionType: string) => {
    if (!contextMenu) return;
    const { node, path: fullPath } = contextMenu;
    const isFolder = node.type === 'folder';
    setContextMenu(null);

    if (actionType === 'close') {
      return;
    }

    if (actionType === 'view') {
      if (!isFolder) {
        setSelectedFileForEditor({ name: node.name, path: fullPath, content: node.content });
      } else {
        toggleFolder(fullPath);
      }
    } else if (actionType === 'explorer') {
      const formData = new FormData();
      formData.append('actionType', 'open_explorer');
      formData.append('path', fullPath);
      fetch('/api/fs/action', { method: 'POST', body: formData }).catch(() => {});
    } else if (actionType === 'copy_path') {
      navigator.clipboard.writeText('/app/applet/examples/' + fullPath);
    } else if (actionType === 'copy_relative') {
      navigator.clipboard.writeText(fullPath);
    } else if (actionType === 'history') {
      setModalTarget({ name: node.name, path: fullPath, isFolder });
      setShowHistoryModal(true);
      setHistoryLoading(true);
      setHistoryData(null);

      const formData = new FormData();
      formData.append('actionType', 'git_history');
      formData.append('path', fullPath);
      fetch('/api/fs/action', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
          setHistoryData(data);
        })
        .catch(err => {
          setHistoryData({ error: err.message });
        })
        .finally(() => {
          setHistoryLoading(false);
        });
    } else if (actionType === 'rename') {
      setModalTarget({ name: node.name, path: fullPath, isFolder });
      setRenameValue(fullPath);
      setShowRenameModal(true);
    } else if (actionType === 'delete') {
      setModalTarget({ name: node.name, path: fullPath, isFolder });
      setShowDeleteModal(true);
    }
  };

  const handleConfirmDelete = () => {
    if (!modalTarget) return;
    setActionLoading(true);

    const formData = new FormData();
    formData.append('actionType', 'delete');
    formData.append('path', modalTarget.path);

    fetch('/api/fs/action', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          setShowDeleteModal(false);
          setModalTarget(null);
          fetchFiles();
        }
      })
      .catch(() => {})
      .finally(() => {
        setActionLoading(false);
      });
  };

  const handleConfirmRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTarget || !renameValue.trim() || renameValue === modalTarget.path) return;
    setActionLoading(true);

    const formData = new FormData();
    formData.append('actionType', 'rename');
    formData.append('path', modalTarget.path);
    formData.append('newPath', renameValue.trim());

    fetch('/api/fs/action', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          setShowRenameModal(false);
          setModalTarget(null);
          fetchFiles();
        }
      })
      .catch(() => {})
      .finally(() => {
        setActionLoading(false);
      });
  };

  return (
    <div className="flex flex-col h-full bg-[#faf8f3]" onContextMenu={(e) => e.preventDefault()}>
      {/* Header: Search Bar + Refresh Button */}
      <div className="p-3 border-b border-[#141310]/10 flex items-center space-x-2 bg-[#f4f1ea]">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#141310]/40" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#faf8f3] border border-[#141310]/20 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:border-[#141310] transition-colors text-[#141310] placeholder-[#141310]/40 font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#141310]/40 hover:text-[#141310]"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={fetchFiles}
          className="p-1.5 text-[#141310]/60 hover:text-[#141310] hover:bg-[#141310]/5 rounded-lg transition-colors flex-shrink-0"
          title="Refresh files"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* File Tree Explorer */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-[#141310]/80 space-y-0.5">
        {isLoading && displayedTree.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40 italic">
            Loading files...
          </div>
        ) : displayedTree.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40 italic">
            No matching files found
          </div>
        ) : (
          displayedTree.map(node => (
            <MobileFileNodeItem
              key={node.path || node.name}
              node={node}
              isOpen={!!openFolders[node.path || node.name]}
              onToggleFolder={toggleFolder}
              onSelectFile={file => setSelectedFileForEditor(file)}
              onContextMenu={handleOpenContextMenu}
              openFolders={openFolders}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isFolder={contextMenu.node.type === 'folder'}
          onAction={handleAction}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && modalTarget && (
        <FileDeleteModal
          fileName={modalTarget.name}
          isFolder={modalTarget.isFolder}
          isLoading={actionLoading}
          onCancel={() => {
            setShowDeleteModal(false);
            setModalTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Rename Modal */}
      {showRenameModal && modalTarget && (
        <FileRenameModal
          isFolder={modalTarget.isFolder}
          renameValue={renameValue}
          originalPath={modalTarget.path}
          isLoading={actionLoading}
          onChange={setRenameValue}
          onCancel={() => {
            setShowRenameModal(false);
            setModalTarget(null);
          }}
          onSubmit={handleConfirmRename}
        />
      )}

      {/* Git History Modal */}
      {showHistoryModal && modalTarget && (
        <FileHistoryModal
          filePath={modalTarget.path}
          fetcherState={historyLoading ? 'loading' : 'idle'}
          fetcherData={historyData}
          onClose={() => {
            setShowHistoryModal(false);
            setModalTarget(null);
          }}
        />
      )}

      {/* Fullscreen Editor when a file is opened */}
      {selectedFileForEditor && (
        <MobileFullEditor
          file={selectedFileForEditor}
          onClose={() => setSelectedFileForEditor(null)}
        />
      )}
    </div>
  );
}
