import { useEffect, useRef, useState } from 'preact/hooks';
import { RefreshCw, Search } from 'lucide-preact';
import type { FsNode } from '@/shared/types';
import { rehydrateTree, setChildrenAt } from '@/shared/lib/fs/file-tree';
import { isRecord } from '@/shared/lib/util/guards';
import { GitRepoDropdown } from '@/client/components/workspace/file-explorer/GitRepoDropdown';
import { FileTreeItem } from '@/client/components/workspace/file-explorer/TreeItem';
import { useScrollbarFade, scrollbarFadeClass } from '@/client/hooks/ui/scrollbar-fade';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { useRepoList, useRepoScope } from '@/client/hooks/workspace/repo-scope';
import { usePanelRefresh, useFileMutationRefresh } from '@/client/hooks/workspace/panel-refresh';

/**
 * The listing on screen, tagged with the `root\0repo` scope it was read for.
 *
 * Tagging it is what makes a workspace switch instant and complete: the panel
 * renders an empty tree until the new root's listing lands, instead of showing
 * the previous workspace's files under the new workspace's header. It also
 * covers what a plain "reset on switch" effect cannot — the children loaded on
 * demand and the expansion set are keyed by paths RELATIVE to the listed root,
 * so `src/` in one workspace would rehydrate into `src/` in the next.
 */
interface Listing {
  scope: string;
  files: FsNode[];
  /** Absolute base dir reported by `/api/fs/dir`; Copy Path anchors on it. */
  root: string;
}

const EMPTY_LISTING: Listing = { scope: '', files: [], root: '' };

/** Directory listing payload from `/api/fs/dir`, validated field by field. */
function readDirPayload(data: unknown): { files: FsNode[]; root: string } {
  if (!isRecord(data)) return { files: [], root: '' };
  return {
    files: Array.isArray(data.files) ? data.files.filter((f): f is FsNode => isRecord(f)) : [],
    root: typeof data.root === 'string' ? data.root : '',
  };
}

export function FileExplorer({ className = '', enabled = true, rootPath, onOpenFile, refreshKey = 0, onRefresh }: { className?: string, enabled?: boolean, rootPath?: string, onOpenFile?: (file: any) => void, refreshKey?: number, onRefresh?: () => void }) {
  const [listing, setListing] = useState<Listing>(EMPTY_LISTING);
  const [searchQuery, setSearchQuery] = useSessionState<string>('files.searchQuery', '');
  const [isLoading, setIsLoading] = useState(false);
  const [storedExpandedPaths, setStoredExpandedPaths, expandedPathsReady] = useSessionState<string[]>('files.expandedPaths', []);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(storedExpandedPaths));
  const childrenCacheRef = useRef<Record<string, FsNode[]>>({});
  const { activeRepo, setActiveRepo } = useRepoScope(rootPath, 'files.activeRepo');
  const { repos, scanning: reposScanning, rescan: rescanRepos } = useRepoList(rootPath, enabled);
  const { isScrolling, handleScroll } = useScrollbarFade();
  const { fileMap: gitFileMap, folderMap: gitFolderMap, refreshGitStatus } = useGitStatus(rootPath, activeRepo, refreshKey, enabled);

  // The scope every request and every cached child path below belongs to. A
  // change to it means the previous workspace's or repo's entries are not this
  // one's, so nothing read under the old value may be rendered.
  const scope = `${rootPath ?? ''}\u0000${activeRepo}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // The scope of the listing on screen, read outside the render closure so the
  // async loaders can tell a superseded tree from the current one.
  const listedScopeRef = useRef(EMPTY_LISTING.scope);

  const commitListing = (next: Listing) => {
    listedScopeRef.current = next.scope;
    setListing(next);
  };

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
    const requested = scopeRef.current;
    if (!opts?.silent) setIsLoading(true);
    fetch(listUrl())
      .then(r => r.json())
      .then(data => {
        // A read that was superseded by a workspace switch describes a tree
        // this panel is no longer showing.
        if (scopeRef.current !== requested) return;
        // Children cached under the previous tree are keyed by paths relative
        // to a root that is not this one: drop them before rehydrating.
        if (listedScopeRef.current !== requested) childrenCacheRef.current = {};
        const payload = readDirPayload(data);
        commitListing({
          scope: requested,
          files: rehydrateTree(payload.files, childrenCacheRef.current),
          root: payload.root,
        });
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

  // The listing and its git decorations describe the same working tree, so one
  // refresh drives both. Re-reading only the tree left every folder dot stale:
  // `useGitStatus` has no poll of its own in this panel, so a new/changed file
  // appeared under a folder that still claimed a clean status until the user
  // hit refresh or refocused the window.
  const refreshListing = () => {
    loadFiles({ silent: true });
    refreshGitStatus();
  };
  // Auto refresh: re-read on a cadence so external changes (terminal output,
  // agent edits) surface without a manual refresh. Silent — the loading
  // spinner stays reserved for the user's own refresh button.
  usePanelRefresh(refreshListing, enabled && expandedPathsReady);
  // AI edits land between poll ticks: re-read right after a file-mutating tool
  // (edit / write / ast_edit / bash) finishes, not up to 2s later.
  useFileMutationRefresh(refreshListing, enabled && expandedPathsReady);

  const loadChildren = (path: string) => {
    // Expanding IS a directory load: fetch the children AND re-read git status,
    // so a freshly listed row never renders bare next to a status map that
    // still predates its change (the panel poll alone can lag a fresh edit).
    refreshGitStatus();
    const requested = scopeRef.current;
    return fetch(listUrl(path))
      .then(r => r.json())
      .then(data => {
        if (scopeRef.current !== requested) return;
        const payload = readDirPayload(data);
        if (payload.files.length === 0 && payload.root === '') return;
        childrenCacheRef.current[path] = payload.files;
        setListing(prev => prev.scope === requested
          ? { ...prev, files: setChildrenAt(prev.files, path, payload.files) }
          : prev);
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
    // The expansion set holds paths relative to the repo that was listed, so a
    // repo switch starts from a collapsed tree. (A workspace switch needs no
    // equivalent: the listing is re-read under the new root, and the session's
    // own expansion set is restored with the session.)
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

  const tree = listing.scope === scope ? listing.files : [];
  const listingRoot = listing.scope === scope ? listing.root : '';

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
          <GitRepoDropdown
            rootPath={rootPath}
            activeRepo={activeRepo}
            onSelectRepo={handleSelectRepo}
            repos={repos}
            scanning={reposScanning}
            onRefreshRepos={rescanRepos}
          />
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

      <div className={`flex-1 scrollbar-overlay-container p-2 font-mono text-[11px] text-ink/80 ${scrollbarFadeClass(isScrolling)}`} onContextMenu={(e) => e.preventDefault()} onScroll={handleScroll}>
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
              basePath={listingRoot}
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
