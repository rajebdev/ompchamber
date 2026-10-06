import { useRef, useState } from 'preact/hooks';
import type { TargetedMouseEvent } from 'preact';

import { useGitStatus } from '@/client/hooks/workspace/git-status';
import { useResolvedRepo } from '@/client/hooks/workspace/repo-scope';
import { usePanelCatalog, type ResolvedPanel } from '@/client/components/workspace/plugin-panel/resolve';
import { usePanelPluginActions, usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { pluginPanelKey } from '@/shared/lib/workspace/panel-ids';
import { BUILTIN_PANELS } from '@/client/components/workspace/panels/builtin';
import { PluginMark } from '@/client/components/settings/categories/panel-plugins/PluginMark';
import { PanelVisibilityMenu, type PanelVisibilityItem } from '@/client/components/layout/PanelVisibilityMenu';

interface RightActivityBarProps {
  /** A built-in view id or a plugin panel key (`plugin:<pluginId>`). */
  activePanel: string;
  onChangePanel: (panel: string) => void;
  isPanelOpen: boolean;
  hasActiveContext: boolean;
  activeProjectPath?: string | null;
}

/**
 * The right developer panel's activity bar.
 *
 * ONE list of buttons: the built-in views and the installed plugins both come
 * from `usePanelCatalog`, so the bar cannot draw one kind from a table and the
 * other from a fetch. The built-ins keep the top positions (that order is the
 * catalog's) and the plugins follow below a divider, because the built-ins are
 * the chamber's own furniture while the plugin list changes with what the user
 * installed.
 *
 * Right-clicking the bar opens the enablement menu — VS Code's own affordance,
 * with its own semantics here: a view that is switched off leaves the bar but
 * stays in that menu with its checkbox off, which is the only place it can be
 * switched back on. EVERY view is switchable, built-in or plugin, because
 * enablement is one set of ids and a built-in view can be put away exactly like
 * an installed one.
 *
 * A plugin contributes AT MOST ONE right panel, so one plugin can never produce
 * two buttons here.
 */
export function RightActivityBar({ activePanel, onChangePanel, isPanelOpen, hasActiveContext, activeProjectPath }: RightActivityBarProps) {
  // The dot is the Source Control view's, so it follows the repo that view is
  // on. Reading it through the shared pick (not through a private copy) is what
  // makes this update the moment the panel's picker moves; polling the workspace
  // root instead showed the wrong repository's changes.
  const activeRepo = useResolvedRepo(activeProjectPath ?? undefined, hasActiveContext);
  const { changes } = useGitStatus(activeProjectPath ?? undefined, activeRepo, hasActiveContext);
  const hasGitChanges = changes.length > 0;

  const catalog = usePanelCatalog();
  const { disabledPanels } = usePanelRegistry();
  const { setEnabled } = usePanelPluginActions();
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const visibleBuiltIns = catalog.filter((panel) => panel.builtin);
  const visiblePlugins = catalog.filter((panel) => !panel.builtin);

  // The menu lists EVERY panel, off or on — a switched-off view must stay
  // reachable, and this list is the only place it can be switched back on. It
  // is built from the FULL id list rather than from the catalog, because a
  // switched-off view is not in the catalog at all. The entry is keyed by the
  // SAME id the disabled set stores, so the checkbox and the write cannot
  // address different panels.
  const allItems = useAllPanelItems();

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
          {visibleBuiltIns.map((panel) => (
            <PanelButton
              key={panel.id}
              panel={panel}
              isActive={isPanelOpen && activePanel === panel.id}
              onClick={() => onChangePanel(panel.id)}
              showGitDot={panel.id === 'git' && hasGitChanges}
            />
          ))}

          {visiblePlugins.length > 0 ? <div className="w-6 border-t border-ink/10 my-1" /> : null}

          {visiblePlugins.map((panel) => (
            <PanelButton
              key={panel.id}
              panel={panel}
              isActive={isPanelOpen && activePanel === panel.id}
              onClick={() => onChangePanel(panel.id)}
              showGitDot={false}
            />
          ))}
        </div>

        <div className="flex-1" />
      </nav>

      {anchor ? (
        <PanelVisibilityMenu
          anchor={anchor}
          items={allItems}
          hidden={disabledPanels}
          onToggle={(id, visible) => void setEnabled(id, visible)}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Every panel the menu can offer, including the ones switched off.
 *
 * A switched-off panel is NOT in the catalog (the catalog is what the bar
 * draws), so reading the menu off the catalog alone would make a hidden view
 * unreachable — the one thing the menu exists to prevent. The built-ins are a
 * static list, so they are always listed; a plugin is listed while it is
 * INSTALLED, read from `plugins` rather than from `panels`, because `panels`
 * holds only the enabled ones and a disabled plugin would lose its row.
 */
function useAllPanelItems(): PanelVisibilityItem[] {
  const { plugins } = usePanelRegistry();
  return [
    ...BUILTIN_PANELS.map((panel) => ({ id: panel.id, title: panel.title, removable: true })),
    ...plugins.map((plugin) => ({
      id: pluginPanelKey(plugin.pluginId),
      title: plugin.name,
      removable: true,
    })),
  ];
}

/** One activity-bar button, drawn from the catalog entry it belongs to. */
function PanelButton({
  panel,
  isActive,
  onClick,
  showGitDot,
}: {
  panel: ResolvedPanel;
  isActive: boolean;
  onClick: () => void;
  showGitDot: boolean;
}) {
  return (
    <button
      className={`relative w-full h-10 flex items-center justify-center transition-colors border-l-2 ${
        isActive ? 'text-ink border-ink bg-ink/5' : 'text-ink/40 border-transparent hover:text-ink hover:bg-ink/5'
      }`}
      onClick={onClick}
      title={panel.title}
      aria-label={panel.title}
    >
      {panel.builtin ? panel.icon : <PluginMark name={panel.name} iconUrl={panel.iconUrl} size={16} />}
      {showGitDot ? (
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-info"
          title="Ada perubahan git"
        />
      ) : null}
    </button>
  );
}
