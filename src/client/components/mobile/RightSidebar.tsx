import { useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { X } from 'lucide-preact';
import { usePluginPanels, PluginPanelBody } from '@/client/components/workspace/plugin-panel/resolve';
import { useHiddenPanels } from '@/client/hooks/workspace/panel-visibility';
import { LazyBrowserPanel, LazyContextPanel, LazyFileExplorer, LazyGitPanel, LazyPlanPanel, LazySearchPanel, LazyTerminalPanel, LazyTodoPanel, LazyUsagePanel, LazyUserBrowserPanel, LazyWikiPanel } from '@/client/components/common/lazy-panels';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { useResolvedRepo } from '@/client/hooks/workspace/repo-scope';
import { GIT_STATUS_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { RIGHT_PANEL_TYPES } from '@/shared/lib/workspace/right-panels';
import { PANEL_META } from '@/client/components/layout/panel-meta';
import { PluginMark } from '@/client/components/settings/categories/panel-plugins/PluginMark';

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
 * The phone's right-side drawer.
 *
 * Same views, same order and same titles as the desktop activity bar: the
 * catalog and the meta table are shared, so the two layouts cannot list the
 * views differently. Visibility is shared too — a view hidden from the desktop
 * bar is hidden here, because that choice is about the CHAMBER, not about one
 * layout — and a hidden view keeps its row in the desktop right-click menu,
 * which is where it is switched back on.
 */
export function MobileRightSidebar({
  enabled = true,
  rootPath,
  refreshKey = 0,
  onRefresh,
  onOpenFile,
  onClose
}: MobileRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<string>('files');
  // Plugin panels are added to the same tab strip as the built-in views: they
  // are right-panel views like any other, and the phone must not be a second
  // list that drifts from the desktop's.
  // The same resolver the desktop bar uses, so the phone lists exactly the
  // plugins that loaded a right panel — not a second list that can drift.
  const { panels: pluginPanels } = usePluginPanels(activeTab);
  // Visibility is the chamber's, not the layout's: a view hidden from the
  // desktop bar is hidden here too, and the desktop right-click menu is where
  // it is switched back on.
  const [hidden] = useHiddenPanels();
  const visibleBuiltIns = RIGHT_PANEL_TYPES.filter((panel) => !hidden.includes(panel));
  const visiblePlugins = pluginPanels.filter((panel) => !hidden.includes(panel.panelKey));
  const activePluginKey = visiblePlugins.find((p) => p.panelKey === activeTab)?.panelKey ?? null;
  // Same source the desktop activity bar uses — the Source Control view's own
  // repo pick, read shared so switching repos moves this dot too. Polls only
  // while this drawer is the mounted screen (the poll is visibility-gated).
  const activeRepo = useResolvedRepo(rootPath, enabled);
  const { changes } = useGitStatus(rootPath, activeRepo, refreshKey, enabled, GIT_STATUS_POLL_MS);
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
          {visibleBuiltIns.map((panel) => (
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
          {visiblePlugins.map((panel) => (
            <button
              key={panel.panelKey}
              type="button"
              onClick={() => setActiveTab(panel.panelKey)}
              className={`relative flex items-center transition-all cursor-pointer ${
                activeTab === panel.panelKey
                  ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                  : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
              }`}
              title={`${panel.title} — ${panel.name}`}
              aria-label={`${panel.title} (plugin ${panel.name})`}
            >
              <PluginMark name={panel.name} iconUrl={panel.iconUrl} size={14} />
              {activeTab === panel.panelKey && <span className="truncate">{panel.title}</span>}
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
          todo list and a plan both belong to the SESSION, not to the folder its
          cwd resolves to, so those tabs stay reachable for a session running
          outside every registered workspace. Every other view here reads the
          working tree and genuinely needs one. */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {activePluginKey ? (
          // A plugin component renders in the host's tree like any other view,
          // so it needs no workspace folder and no session: it reads whatever
          // the host published and draws what it can. Gating it here would hide
          // a panel that works.
          <PluginPanelBody panelKey={activePluginKey} />
        ) : !enabled && activeTab !== 'todo' && activeTab !== 'plan' ? (
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
              {activeTab === 'plan' && <LazyPlanPanel className="h-full w-full" active />}
              {activeTab === 'wiki' && <LazyWikiPanel className="h-full w-full" rootPath={rootPath} enabled={enabled} active />}
            </Suspense>
          </>
        )}
      </div>

    </div>
  );
}
