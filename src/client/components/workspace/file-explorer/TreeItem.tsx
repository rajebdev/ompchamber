import { useEffect, useState } from 'preact/hooks';
import type { FormEvent } from 'preact/compat';
import { ChevronDown, ChevronRight } from 'lucide-preact';
import { useFetcher } from '@/client/lib/router/fetcher';
import { FileIcon } from '@/client/components/common/FileIcon';
import { FileContextMenu, FileDeleteModal, FileHistoryModal, FileRenameModal } from '@/client/components/workspace/file-explorer/Modals';
import { getGitStatusInfo, type FolderGitStatusInfo } from '@/shared/lib/fs/git-status';
import type { GitChange } from '@/shared/types/git';

interface FileTreeItemProps {
  file: any;
  rootPath?: string;
  repo?: string;
  onLoadChildren?: (path: string) => Promise<void>;
  onOpenFile?: (file: any) => void;
  onActionComplete: () => void;
  expandedPaths?: Set<string>;
  onToggleFolder?: (path: string, open: boolean) => void;
  gitFileMap?: Map<string, GitChange>;
  gitFolderMap?: Map<string, FolderGitStatusInfo>;
}

export function FileTreeItem({
  file,
  rootPath,
  repo,
  onLoadChildren,
  onOpenFile,
  onActionComplete,
  expandedPaths,
  onToggleFolder,
  gitFileMap,
  gitFolderMap,
}: FileTreeItemProps) {
  const isFolder = file.type === 'folder';
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const actionFetcher = useFetcher<any>();
  const [mounted, setMounted] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [renameValue, setRenameValue] = useState(file.path);

  const children = Array.isArray(file.children) ? file.children : [];

  const normalizedPath = (file.path || '').replace(/^\/+/, '');
  const gitChange = !isFolder ? (gitFileMap?.get(normalizedPath) || gitFileMap?.get(file.path)) : undefined;
  const gitStatusInfo = gitChange ? getGitStatusInfo(gitChange.status, gitChange.staged) : null;
  const folderStatus = isFolder ? (gitFolderMap?.get(normalizedPath) || gitFolderMap?.get(file.path)) : null;
  const hasGitStatus = Boolean(gitStatusInfo);

  const isExpanded = expandedPaths ? expandedPaths.has(file.path) : isOpen;
  const actualIsOpen = file.forceExpanded !== undefined ? file.forceExpanded : isExpanded;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isFolder && expandedPaths) {
      setIsOpen(expandedPaths.has(file.path));
    }
  }, [expandedPaths, file.path, isFolder]);

  useEffect(() => {
    if (isFolder && actualIsOpen && (!file.children || file.children.length === 0) && onLoadChildren && !isLoadingChildren) {
      setIsLoadingChildren(true);
      Promise.resolve(onLoadChildren(file.path)).finally(() => setIsLoadingChildren(false));
    }
  }, [isFolder, actualIsOpen, file.children, file.path, onLoadChildren]);

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
          setShowRenameModal(false);
          setShowDeleteModal(false);
          onActionComplete();
        }
      }
    }
  }, [actionFetcher.state, actionFetcher.data]);

  const handleToggle = (e: globalThis.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      const next = !actualIsOpen;
      setIsOpen(next);
      if (file.forceExpanded !== undefined) {
        file.forceExpanded = undefined;
      }
      onToggleFolder?.(file.path, next);
      if (next && onLoadChildren && (!file.children || file.children.length === 0)) {
        setIsLoadingChildren(true);
        Promise.resolve(onLoadChildren(file.path)).finally(() => setIsLoadingChildren(false));
      }
    } else {
      if (onOpenFile) {
        onOpenFile({
          ...file,
          root: rootPath,
          repo: repo || '.',
        });
      }
    }
  };

  const handleContextMenu = (e: globalThis.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const submitAction = (formData: FormData) => {
    if (repo && repo !== '.') formData.append('repo', repo);
    if (rootPath) formData.append('root', rootPath);
    actionFetcher.submit(formData, { method: 'post', action: '/api/fs/action' });
  };

  const handleAction = (actionType: string) => {
    setContextMenu(null);
    if (actionType === 'view') {
      if (onOpenFile) {
        onOpenFile({
          ...file,
          root: rootPath,
          repo: repo || '.',
        });
      }
    } else if (actionType === 'diff') {
      window.dispatchEvent(new CustomEvent('omp:open-diff', {
        detail: {
          file: file.path,
          staged: gitChange?.staged || (gitChange?.status && gitChange.status[0] !== ' ' && gitChange.status[0] !== '?'),
          status: gitStatusInfo?.charStatus || 'M',
          repo: repo || '.',
          root: rootPath,
        }
      }));
    } else if (actionType === 'explorer') {
      const fd = new FormData();
      fd.append('actionType', 'open_explorer');
      fd.append('path', file.path);
      submitAction(fd);
    } else if (actionType === 'copy_path') {
      navigator.clipboard.writeText('/app/applet/examples/' + file.path);
    } else if (actionType === 'copy_relative') {
      navigator.clipboard.writeText(file.path);
    } else if (actionType === 'history') {
      setShowHistoryModal(true);
      const fd = new FormData();
      fd.append('actionType', 'git_history');
      fd.append('path', file.path);
      submitAction(fd);
    } else if (actionType === 'rename') {
      setRenameValue(file.path);
      setShowRenameModal(true);
    } else if (actionType === 'delete') {
      setShowDeleteModal(true);
    }
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('actionType', 'rename');
    fd.append('path', file.path);
    fd.append('newPath', renameValue);
    submitAction(fd);
  };

  const submitDelete = () => {
    const fd = new FormData();
    fd.append('actionType', 'delete');
    fd.append('path', file.path);
    submitAction(fd);
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
        <span className={`truncate min-w-0 flex-1 ${gitStatusInfo ? gitStatusInfo.colorClass : folderStatus ? folderStatus.colorClass : ''}`}>
          {file.name}
        </span>

        {gitStatusInfo && (
          <span
            className={`font-mono text-[9px] font-bold px-1 rounded flex-shrink-0 ${gitStatusInfo.colorClass}`}
            title={`Git: ${gitStatusInfo.label}`}
          >
            {gitStatusInfo.charStatus}
          </span>
        )}

        {folderStatus && (
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              folderStatus.hasDeleted ? 'bg-error' :
              folderStatus.hasModified || folderStatus.hasStaged ? 'bg-info' : 'bg-success'
            }`}
            title={`${folderStatus.count} changed file${folderStatus.count > 1 ? 's' : ''}`}
          />
        )}
      </div>

      {actualIsOpen && isLoadingChildren && (
        <div className="ml-3 border-l border-ink/10 pl-3 py-0.5 text-[10px] text-ink/30">Loading…</div>
      )}

      {actualIsOpen && !isLoadingChildren && children.length > 0 && (
        <div className="ml-3 border-l border-ink/10 pl-1">
          {children.map((child: any) => (
            <FileTreeItem
              key={child.id}
              file={child}
              rootPath={rootPath}
              repo={repo}
              onLoadChildren={onLoadChildren}
              onOpenFile={onOpenFile}
              onActionComplete={onActionComplete}
              expandedPaths={expandedPaths}
              onToggleFolder={onToggleFolder}
              gitFileMap={gitFileMap}
              gitFolderMap={gitFolderMap}
            />
          ))}
        </div>
      )}

      {mounted && contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isFolder={isFolder}
          hasGitStatus={hasGitStatus}
          onAction={handleAction}
        />
      )}

      {mounted && showDeleteModal && (
        <FileDeleteModal
          fileName={file.name}
          isFolder={isFolder}
          isLoading={actionFetcher.state !== 'idle'}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={submitDelete}
        />
      )}

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

