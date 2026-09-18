import { useEffect, useRef, useState } from 'preact/hooks';
import { RefreshCw, Search } from 'lucide-preact';
import { rehydrateTree, setChildrenAt } from '@/shared/lib/fs/file-tree';
import { GitRepoDropdown } from '@/client/components/workspace/file-explorer/GitRepoDropdown';
import { FileTreeItem } from '@/client/components/workspace/file-explorer/TreeItem';
import { useScrollbarFade } from '@/client/hooks/ui/scrollbar-fade';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';

export function FileExplorer({ className = '', enabled = true, rootPath, onOpenFile, refreshKey = 0, onRefresh }: { className?: string, enabled?: boolean, rootPath?: string, onOpenFile?: (file: any) => void, refreshKey?: number, onRefresh?: () => void }) {
  const [tree, setTree] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useSessionState<string>('files.searchQuery', '');
  const [isLoading, setIsLoading] = useState(false);
  const [storedExpandedPaths, setStoredExpandedPaths, expandedPathsReady] = useSessionState<string[]>('files.expandedPaths', []);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(storedExpandedPaths));
  const childrenCacheRef = useRef<Record<string, any[]>>({});
  const [activeRepo, setActiveRepo] = useSessionState<string>('files.activeRepo', '.');
  const { isScrolling, handleScroll } = useScrollbarFade();
  const { fileMap: gitFileMap, folderMap: gitFolderMap, refreshGitStatus } = useGitStatus(rootPath, activeRepo, refreshKey, enabled);

  useEffect(() => {
    if (!expandedPathsReady) return;
    setExpandedPaths(prev => {
      const next = new Set(storedExpandedPaths);
      if (prev.size === next.size && Array.from(next).every(path => prev.has(path))) return prev;
      return next;
    });
  }, [expandedPathsReady, storedExpandedPaths]);

  const listUrl = (path?: string) => {
    const params = new URLSearchParams();
    if (rootPath) params.set('root', rootPath);
    if (activeRepo && activeRepo !== '.') params.set('repo', activeRepo);
    if (path) params.set('path', path);
    params.set('t', String(Date.now()));
    return `/api/fs/dir?${params.toString()}`;
  };

  const loadFiles = (opts?: { silent?: boolean }) => {
    if (!enabled) return;
    if (!opts?.silent) setIsLoading(true);
    fetch(listUrl())
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.files)) {
          setTree(rehydrateTree(data.files, childrenCacheRef.current, expandedPaths));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!opts?.silent) setIsLoading(false);
      });
  };

  useEffect(() => {
    if (!expandedPathsReady) return;
    loadFiles();
  }, [refreshKey, rootPath, enabled, activeRepo, expandedPathsReady]);

  // Auto refresh: re-read the directory tree on a cadence so external changes
  // (terminal output, agent edits) surface without a manual refresh. Silent —
  // the loading spinner stays reserved for the user's own refresh button.
  usePanelRefresh(() => loadFiles({ silent: true }), enabled && expandedPathsReady);

  const loadChildren = (path: string) => {
    return fetch(listUrl(path))
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
    const next = new Set(expandedPaths);
    if (open) next.add(path);
    else next.delete(path);
    setExpandedPaths(next);
    setStoredExpandedPaths(Array.from(next));
  };

  const handleSelectRepo = (repo: string) => {
    if (repo === activeRepo) return;
    childrenCacheRef.current = {};
    setExpandedPaths(new Set());
    setStoredExpandedPaths([]);
    setActiveRepo(repo);
  };

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

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
  const refresh = () => {
    refreshGitStatus();
    if (onRefresh) onRefresh();
    else loadFiles();
  };

  return (
    <div className={`flex flex-col h-full bg-paper ${className}`}>
      <div className="p-3 border-b border-ink/10 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <GitRepoDropdown rootPath={rootPath} activeRepo={activeRepo} onSelectRepo={handleSelectRepo} />
          <button
            onClick={refresh}
            className="p-1.5 text-ink/40 hover:text-ink hover:bg-ink/5 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            className="w-full bg-canvas border border-ink/20 rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-ink transition-colors text-ink placeholder-ink/40"
          />
        </div>
      </div>

      <div className={`flex-1 scrollbar-overlay-container p-2 font-mono text-[11px] text-ink/80 ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`} onContextMenu={(e) => e.preventDefault()} onScroll={handleScroll}>
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
            <FileTreeItem
              key={file.id}
              file={file}
              rootPath={rootPath}
              repo={activeRepo}
              onLoadChildren={loadChildren}
              onOpenFile={onOpenFile}
              onActionComplete={refresh}
              expandedPaths={expandedPaths}
              onToggleFolder={handleToggleFolder}
              gitFileMap={gitFileMap}
              gitFolderMap={gitFolderMap}
            />
          ))
        )}
      </div>
    </div>
  );
}
