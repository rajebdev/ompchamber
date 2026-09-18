import { useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { BarChart3, Bot, Files, GitBranch, Globe, Layers, Search, Terminal, X } from 'lucide-preact';
import { LazyBrowserPanel, LazyContextPanel, LazyFileExplorer, LazyGitPanel, LazySearchPanel, LazyTerminalPanel, LazyUsagePanel, LazyUserBrowserPanel } from '@/client/components/common/lazy-panels';
import { useGitStatus } from '@/client/hooks/workspace/git-status';

interface MobileRightSidebarProps {
  enabled?: boolean;
  rootPath?: string;
  /** Bumped after a write so the explorer, git and context panels re-read. */
  refreshKey?: number;
  onRefresh?: () => void;
  onOpenFile?: (file: unknown) => void;
  onClose: () => void;
}

type MobileTab = 'git' | 'files' | 'search' | 'context' | 'terminal' | 'user-browser' | 'browser' | 'usage';

export function MobileRightSidebar({
  enabled = true,
  rootPath,
  refreshKey = 0,
  onRefresh,
  onOpenFile,
  onClose
}: MobileRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('files');
  // Same source the desktop activity bar uses, so the "uncommitted changes"
  // dot means the same thing on both layouts. Polls only while this drawer is
  // the mounted screen — the poll itself is visibility-gated by the hook.
  const { changes } = useGitStatus(rootPath, '.', refreshKey, enabled, 15000);
  const hasGitChanges = changes.length > 0;

  return (
    <div className="flex flex-col h-full w-full bg-paper text-ink relative select-none">

      {/* Top Header & Tab Navigation Bar */}
      <div
        className="border-b border-ink/10 flex items-center justify-between px-3 flex-shrink-0 bg-canvas"
        style={{
          height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
      >

        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'files'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Files Explorer"
          >
            <Files size={14} className="flex-shrink-0" />
            {activeTab === 'files' && <span>Files</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Search Workspace"
          >
            <Search size={14} className="flex-shrink-0" />
            {activeTab === 'search' && <span>Search</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('git')}
            className={`relative flex items-center transition-all cursor-pointer ${
              activeTab === 'git'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="GIT"
          >
            <GitBranch size={14} className="flex-shrink-0" />
            {activeTab === 'git' && <span className="tracking-wide">GIT</span>}
            {hasGitChanges && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-info"
                title="Uncommitted changes"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'context'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Context & Telemetry"
          >
            <Layers size={14} className="flex-shrink-0" />
            {activeTab === 'context' && <span>Context</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'terminal'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Bun Terminal"
          >
            <Terminal size={14} className="flex-shrink-0" />
            {activeTab === 'terminal' && <span>Terminal</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('user-browser')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'user-browser'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Browser (Anda)"
          >
            <Globe size={14} className="flex-shrink-0" />
            {activeTab === 'user-browser' && <span>Browser</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'browser'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Browser Agent"
          >
            <Bot size={14} className="flex-shrink-0" />
            {activeTab === 'browser' && <span>Agent</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('usage')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'usage'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Usage"
          >
            <BarChart3 size={14} className="flex-shrink-0" />
            {activeTab === 'usage' && <span>Usage</span>}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-ink/5 active:bg-ink/10 text-ink transition-colors flex-shrink-0 ml-2"
          title="Close right sidebar"
          aria-label="Close right sidebar"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>

      {/* Main Tab Content — shared components so mobile == desktop features */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {!enabled ? (
          <div className="h-full flex items-center justify-center text-ink/40">
            <span className="text-xs font-mono">No session selected</span>
          </div>
        ) : (
          <>
            <Suspense fallback={<div className="h-full flex items-center justify-center text-ink/40"><span className="text-xs font-mono">Loading…</span></div>}>
              {activeTab === 'files' && (
                <LazyFileExplorer className="h-full w-full" enabled={enabled} rootPath={rootPath} refreshKey={refreshKey} onRefresh={onRefresh} onOpenFile={onOpenFile} />
              )}
              {activeTab === 'search' && (
                <LazySearchPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} />
              )}
              {activeTab === 'git' && (
                <LazyGitPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} refreshKey={refreshKey} />
              )}
              {activeTab === 'context' && (
                <LazyContextPanel className="h-full w-full" enabled={enabled} refreshKey={refreshKey} onClose={onClose} />
              )}
              {activeTab === 'terminal' && (
                <LazyTerminalPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} showHeader={false} />
              )}
              {activeTab === 'user-browser' && <LazyUserBrowserPanel className="h-full w-full" />}
              {activeTab === 'browser' && <LazyBrowserPanel className="h-full w-full" active />}
              {activeTab === 'usage' && <LazyUsagePanel className="h-full w-full" />}
            </Suspense>
          </>
        )}
      </div>

    </div>
  );
}
