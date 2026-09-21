import { BarChart3, Bot, Files, GitBranch, Globe, Layers, Search, Terminal } from 'lucide-preact';
import type { ReactNode } from 'preact/compat';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { GIT_STATUS_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';

interface RightActivityBarProps {
  activePanel: RightPanelType;
  onChangePanel: (panel: RightPanelType) => void;
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
};

export function RightActivityBar({ activePanel, onChangePanel, isPanelOpen, hasActiveContext, activeProjectPath, refreshKey }: RightActivityBarProps) {
  const { changes } = useGitStatus(activeProjectPath ?? undefined, '.', refreshKey, hasActiveContext, GIT_STATUS_POLL_MS);
  const hasGitChanges = changes.length > 0;

  return (
    <nav className="w-12 flex-shrink-0 border-l border-ink/10 bg-paper flex flex-col items-center py-3 space-y-2 z-10">
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
      </div>

      <div className="flex-1" />
    </nav>
  );
}
