import { useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import type { ReactNode } from 'preact/compat';
import { BarChart3, Bot, Files, GitBranch, Globe, Layers, ListTodo, Search, Terminal, X } from 'lucide-preact';
import { LazyBrowserPanel, LazyContextPanel, LazyFileExplorer, LazyGitPanel, LazySearchPanel, LazyTerminalPanel, LazyTodoPanel, LazyUsagePanel, LazyUserBrowserPanel } from '@/client/components/common/lazy-panels';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { GIT_STATUS_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';

interface MobileRightSidebarProps {
  enabled?: boolean;
  rootPath?: string;
  /** Bumped after a write so the explorer, git and context panels re-read. */
  refreshKey?: number;
  onRefresh?: () => void;
  onOpenFile?: (file: unknown) => void;
  onClose: () => void;
}

/**
 * Wording per view: the title is the desktop activity bar's, the label is the
 * short chip the phone shows beside the icon. The *order* is not restated here
 * — it comes from RIGHT_PANEL_TYPES, so both layouts list the views the same way.
 */
const PANEL_META: Record<RightPanelType, { title: string; label: string; icon: ReactNode }> = {
  context: { title: 'Context & Telemetry', label: 'Context', icon: <Layers size={14} className="flex-shrink-0" /> },
  files: { title: 'Files Explorer', label: 'Files', icon: <Files size={14} className="flex-shrink-0" /> },
  search: { title: 'Search Workspace', label: 'Search', icon: <Search size={14} className="flex-shrink-0" /> },
  git: { title: 'GIT', label: 'GIT', icon: <GitBranch size={14} className="flex-shrink-0" /> },
  terminal: { title: 'Bun Terminal', label: 'Terminal', icon: <Terminal size={14} className="flex-shrink-0" /> },
  'user-browser': { title: 'Browser (Anda)', label: 'Browser', icon: <Globe size={14} className="flex-shrink-0" /> },
  browser: { title: 'Browser Agent', label: 'Agent', icon: <Bot size={14} className="flex-shrink-0" /> },
  usage: { title: 'Usage', label: 'Usage', icon: <BarChart3 size={14} className="flex-shrink-0" /> },
  todo: { title: 'Todos', label: 'Todos', icon: <ListTodo size={14} className="flex-shrink-0" /> },
};

export function MobileRightSidebar({
  enabled = true,
  rootPath,
  refreshKey = 0,
  onRefresh,
  onOpenFile,
  onClose
}: MobileRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<RightPanelType>('files');
  // Same source the desktop activity bar uses, so the "uncommitted changes"
  // dot means the same thing on both layouts. Polls only while this drawer is
  // the mounted screen — the poll itself is visibility-gated by the hook.
  const { changes } = useGitStatus(rootPath, '.', refreshKey, enabled, GIT_STATUS_POLL_MS);
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
          {RIGHT_PANEL_TYPES.map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => setActiveTab(panel)}
              className={`relative flex items-center transition-all cursor-pointer ${
                activeTab === panel
                  ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                  : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
              }`}
              title={PANEL_META[panel].title}
            >
              {PANEL_META[panel].icon}
              {activeTab === panel && (
                <span className={panel === 'git' ? 'tracking-wide' : undefined}>{PANEL_META[panel].label}</span>
              )}
              {panel === 'git' && hasGitChanges && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-info"
                  title="Uncommitted changes"
                />
              )}
            </button>
          ))}
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

      {/* Main Tab Content — shared components so mobile == desktop features.
          The workspace gate below applies per TAB, not to the whole drawer: a
          todo list belongs to the session, not to the folder its cwd resolves
          to, so the Todos tab stays reachable for a session running outside
          every registered workspace. Every other view here reads the working
          tree and genuinely needs one. */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {!enabled && activeTab !== 'todo' ? (
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
              {activeTab === 'todo' && <LazyTodoPanel className="h-full w-full" />}
            </Suspense>
          </>
        )}
      </div>

    </div>
  );
}
