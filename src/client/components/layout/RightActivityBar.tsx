import { BarChart3, BookOpen, Bot, ClipboardList, Files, GitBranch, Globe, Layers, ListTodo, Puzzle, Search, Terminal } from 'lucide-preact';
import type { ReactNode } from 'preact/compat';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { useResolvedRepo } from '@/client/hooks/workspace/repo-scope';
import { usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { panelAssetUrl } from '@/shared/lib/panels/asset-base';
import { GIT_STATUS_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';

interface RightActivityBarProps {
  /** A built-in view id or a plugin panel key (`plugin:<id>/<panel>`). */
  activePanel: string;
  onChangePanel: (panel: string) => void;
  isPanelOpen: boolean;
  hasActiveContext: boolean;
  activeProjectPath?: string | null;
  refreshKey: number;
}

/**
 * Icon and tooltip per view. The *order* is not restated here: it comes from
 * RIGHT_PANEL_TYPES, the same list the phone's right-sidebar tab bar renders,
 * so the two layouts cannot list the views differently.
 */
const PANEL_META: Record<RightPanelType, { title: string; icon: ReactNode }> = {
  context: { title: 'Context & Telemetry', icon: <Layers size={16} /> },
  files: { title: 'Files', icon: <Files size={16} /> },
  search: { title: 'Search', icon: <Search size={16} /> },
  git: { title: 'Source Control', icon: <GitBranch size={16} /> },
  terminal: { title: 'Terminal (Bun)', icon: <Terminal size={16} /> },
  'user-browser': { title: 'Browser (Anda)', icon: <Globe size={16} /> },
  browser: { title: 'Browser Agent', icon: <Bot size={16} /> },
  usage: { title: 'Usage', icon: <BarChart3 size={16} /> },
  todo: { title: 'Todos', icon: <ListTodo size={16} /> },
  wiki: { title: 'Wiki', icon: <BookOpen size={16} /> },
  plan: { title: 'Plan (sesi ini)', icon: <ClipboardList size={16} /> },
};

export function RightActivityBar({ activePanel, onChangePanel, isPanelOpen, hasActiveContext, activeProjectPath, refreshKey }: RightActivityBarProps) {
  // The dot is the Source Control view's, so it follows the repo that view is
  // on. Reading it through the shared pick (not through a private copy) is what
  // makes this update the moment the panel's picker moves; polling the workspace
  // root instead showed the wrong repository's changes.
  const activeRepo = useResolvedRepo(activeProjectPath ?? undefined, hasActiveContext);
  const { changes } = useGitStatus(activeProjectPath ?? undefined, activeRepo, refreshKey, hasActiveContext, GIT_STATUS_POLL_MS);
  const hasGitChanges = changes.length > 0;

  // Plugin panels sit below the built-in views: the built-in set is the
  // chamber's own furniture and its positions are stable, while the plugin list
  // changes with what the user installed. A plugin that declares an icon uses
  // it; one that does not gets a generic mark rather than a blank button.
  const { panels: pluginPanels } = usePanelRegistry();

  return (
    <nav className="w-11 flex-shrink-0 border-l border-ink/10 bg-paper flex flex-col items-center py-3 space-y-2 z-10">
      {/* Top Icons */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {RIGHT_PANEL_TYPES.map((panel) => {
          const isActive = isPanelOpen && activePanel === panel;
          return (
            <button
              key={panel}
              className={`relative w-full h-10 flex items-center justify-center transition-colors border-l-2 ${
                isActive
                  ? 'text-ink border-ink bg-ink/5'
                  : 'text-ink/40 border-transparent hover:text-ink hover:bg-ink/5'
              }`}
              onClick={() => onChangePanel(panel)}
              title={PANEL_META[panel].title}
            >
              {PANEL_META[panel].icon}
              {panel === 'git' && hasGitChanges && (
                <span
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-info"
                  title="Ada perubahan git"
                />
              )}
            </button>
          );
        })}

        {pluginPanels.length > 0 ? <div className="w-6 border-t border-ink/10 my-1" /> : null}

        {pluginPanels.map((panel) => {
          const isActive = isPanelOpen && activePanel === panel.panelKey;
          return (
            <button
              key={panel.panelKey}
              className={`relative w-full h-10 flex items-center justify-center transition-colors border-l-2 ${
                isActive
                  ? 'text-ink border-ink bg-ink/5'
                  : 'text-ink/40 border-transparent hover:text-ink hover:bg-ink/5'
              }`}
              onClick={() => onChangePanel(panel.panelKey)}
              title={`${panel.title} — ${panel.pluginName}`}
              aria-label={`${panel.title} (plugin ${panel.pluginName})`}
            >
              {panel.icon ? (
                <img src={panelAssetUrl(panel.panelKey, panel.icon)} alt="" className="w-4 h-4" />
              ) : (
                <Puzzle size={16} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />
    </nav>
  );
}
