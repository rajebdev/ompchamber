import { useRef, useState } from 'preact/hooks';
import type { TargetedMouseEvent } from 'preact';
import { Puzzle } from 'lucide-preact';
import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { useResolvedRepo } from '@/client/hooks/workspace/repo-scope';
import { usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { useHiddenPanels } from '@/client/hooks/workspace/panel-visibility';
import { panelAssetUrl } from '@/shared/lib/panels/asset-base';
import { GIT_STATUS_POLL_MS } from '@/shared/lib/workspace/refresh-cadence';
import { RIGHT_PANEL_TYPES } from '@/shared/lib/workspace/right-panels';
import { PANEL_META } from '@/client/components/layout/panel-meta';
import { PanelVisibilityMenu, type PanelVisibilityItem } from '@/client/components/layout/PanelVisibilityMenu';

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
 * The right developer panel's activity bar.
 *
 * Two groups, and the split is deliberate: the built-in views are the chamber's
 * own furniture and keep stable positions, while the plugin panels sit below a
 * divider because the list changes with what the user installed.
 *
 * Right-clicking the bar opens the visibility menu — VS Code's own affordance —
 * so a view can be hidden without uninstalling anything. Hidden views keep
 * their row in that menu with the checkbox off, which is what makes hiding
 * reversible; the bar itself simply does not draw them.
 *
 * An icon is only ever drawn for a plugin that CONTRIBUTES one view per
 * position: the manifest refuses a second `right` panel, so one plugin cannot
 * produce two buttons here.
 */
export function RightActivityBar({ activePanel, onChangePanel, isPanelOpen, hasActiveContext, activeProjectPath, refreshKey }: RightActivityBarProps) {
  // The dot is the Source Control view's, so it follows the repo that view is
  // on. Reading it through the shared pick (not through a private copy) is what
  // makes this update the moment the panel's picker moves; polling the workspace
  // root instead showed the wrong repository's changes.
  const activeRepo = useResolvedRepo(activeProjectPath ?? undefined, hasActiveContext);
  const { changes } = useGitStatus(activeProjectPath ?? undefined, activeRepo, refreshKey, hasActiveContext, GIT_STATUS_POLL_MS);
  const hasGitChanges = changes.length > 0;

  const { panels: pluginPanels } = usePanelRegistry();
  const [hidden, setHidden] = useHiddenPanels();
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const visibleBuiltIns = RIGHT_PANEL_TYPES.filter((panel) => !hidden.includes(panel));
  const visiblePlugins = pluginPanels.filter((panel) => !hidden.includes(panel.panelKey));

  // The menu lists EVERY view, hidden or not — a hidden view must stay
  // reachable, and this list is the only place it can be switched back on. The
  // built-ins are pinned (hiding them is what the panel toggles in the navbar
  // are for); plugin panels are the removable ones.
  const menuItems: PanelVisibilityItem[] = [
    ...RIGHT_PANEL_TYPES.map((panel) => ({ id: panel, title: PANEL_META[panel].title, removable: false })),
    ...pluginPanels.map((panel) => ({
      id: panel.panelKey,
      title: `${panel.title} — ${panel.pluginName}`,
      removable: true,
    })),
  ];

  const openMenu = (event: TargetedMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const rect = navRef.current?.getBoundingClientRect();
    setAnchor({
      top: rect?.top ?? 0,
      bottom: rect?.bottom ?? 0,
      left: rect?.left ?? event.clientX,
      right: rect?.right ?? event.clientX,
    });
  };

  return (
    <>
      <nav
        ref={navRef}
        onContextMenu={openMenu}
        className="w-11 flex-shrink-0 border-l border-ink/10 bg-paper flex flex-col items-center py-3 space-y-2 z-10"
      >
        <div className="flex flex-col items-center space-y-1 w-full">
          {visibleBuiltIns.map((panel) => {
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
                aria-label={PANEL_META[panel].title}
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

          {visiblePlugins.length > 0 ? <div className="w-6 border-t border-ink/10 my-1" /> : null}

          {visiblePlugins.map((panel) => {
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

      {anchor ? (
        <PanelVisibilityMenu
          anchor={anchor}
          items={menuItems}
          hidden={hidden}
          onToggle={(id, visible) => setHidden(visible ? hidden.filter((entry) => entry !== id) : [...hidden, id])}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  );
}
