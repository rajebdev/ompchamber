import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ChevronRight } from 'lucide-preact';
import { FileIcon } from '@/client/components/common/file-icon';
import { FileContextMenu, FileCreateModal, FileDeleteModal, FileHistoryModal, FileRenameModal } from '@/client/components/workspace/file-explorer/Modals';
import { getGitStatusInfo, type FolderGitStatusInfo } from '@/shared/lib/fs/git-status';
import { useFileActions } from '@/client/hooks/workspace/file-tree-actions';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import type { GitChange } from '@/shared/types/git';

interface FileTreeItemProps {
  file: any;
  rootPath?: string;
  /** Absolute base dir of the listing (server-reported `root`), anchors Copy Path. */
  basePath?: string;
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
  basePath,
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
  /** Portals need a real document; the first client render is the gate. */
  const [mounted, setMounted] = useState(false);
  const children = Array.isArray(file.children) ? file.children : [];

  const normalizedPath = (file.path || '').replace(/^\/+/, '');
  const gitChange = !isFolder ? (gitFileMap?.get(normalizedPath) || gitFileMap?.get(file.path)) : undefined;
  const gitStatusInfo = gitChange ? getGitStatusInfo(gitChange.status, gitChange.staged) : null;
  const folderStatus = isFolder ? (gitFolderMap?.get(normalizedPath) || gitFolderMap?.get(file.path)) : null;
  const hasGitStatus = Boolean(gitStatusInfo);
  // Git-ignored entries (local .gitignore or the global excludes file) are still
  // listed but rendered faded, the way an editor dims untracked noise.
  const isIgnored = file.ignored === true;

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

  const actions = useFileActions({
    file: { path: file.path, name: file.name, basePath, rootPath, repo },
    diff: { staged: gitChange?.staged || (gitChange?.status ? gitChange.status[0] !== ' ' && gitChange.status[0] !== '?' : false), status: gitStatusInfo?.charStatus },
    onOpenFile,
    onActionComplete,
  });
  useOnClickOutside(actions.contextMenuRef, actions.closeContextMenu);

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
    actions.openContextMenu(e.clientX, e.clientY);
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

        <FileIcon name={file.name} isFolder={isFolder} isOpen={actualIsOpen} size={12} className={`flex-shrink-0${isIgnored ? ' opacity-40' : ''}`} />
        <span
          className={`truncate min-w-0 flex-1 ${gitStatusInfo ? gitStatusInfo.colorClass : folderStatus ? folderStatus.colorClass : isIgnored ? 'text-ink/40' : ''}`}
          title={isIgnored ? `${file.path} — git-ignored` : undefined}
        >
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
              basePath={basePath}
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

      {mounted && actions.contextMenu && (
        <FileContextMenu
          x={actions.contextMenu.x}
          y={actions.contextMenu.y}
          isFolder={isFolder}
          hasGitStatus={hasGitStatus}
          onAction={actions.handleAction}
        />
      )}

      {mounted && actions.showCreateModal && (
        <FileCreateModal
          folderPath={file.path}
          value={actions.createName}
          error={actions.createError}
          isLoading={actions.busy}
          onChange={actions.setCreateName}
          onCancel={actions.closeCreate}
          onSubmit={actions.submitCreate}
        />
      )}

      {mounted && actions.showDeleteModal && (
        <FileDeleteModal
          fileName={file.name}
          isFolder={isFolder}
          isLoading={actions.busy}
          onCancel={actions.closeDelete}
          onConfirm={actions.submitDelete}
        />
      )}

      {mounted && actions.showRenameModal && (
        <FileRenameModal
          isFolder={isFolder}
          renameValue={actions.renameValue}
          originalPath={file.path}
          isLoading={actions.busy}
          onChange={actions.setRenameValue}
          onCancel={actions.closeRename}
          onSubmit={actions.submitRename}
        />
      )}

      {mounted && actions.showHistoryModal && (
        <FileHistoryModal
          filePath={file.path}
          fetcherState={actions.fetcherState}
          fetcherData={actions.fetcherData}
          onClose={actions.closeHistory}
        />
      )}
    </div>
  );
}

