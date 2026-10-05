import { useRef, useState } from 'preact/hooks';
import { Puzzle } from 'lucide-preact';
import type { PanelRegistryEntry } from '@/shared/types';
import { usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { panelAssetUrl } from '@/shared/lib/panels/asset-base';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';

/**
 * The navbar entry point for panels that can occupy the EDITOR slot.
 *
 * A right-panel panel gets an activity-bar button, but an editor panel has no
 * such home — it opens as a TAB, the way VS Code's webview panels occupy an
 * editor column. The menu is hidden entirely when no plugin contributes a
 * panel, so a user with no panel plugins sees an unchanged navbar.
 *
 * The list is every plugin panel, not only the ones declared `position:
 * "editor"`. The manifest's position decides where a panel appears BY DEFAULT;
 * the editor slot is generic and can hold any of them, which is what lets a
 * user move a right-panel view into the editor column without the plugin
 * author having to declare it twice.
 */
export function PanelLauncher() {
  const { panels } = usePanelRegistry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  if (panels.length === 0) return null;

  // A `header` panel is a navbar dropdown, not a view: offering it as an editor
  // tab would open the same plugin twice from two unrelated affordances.
  const openable = panels.filter((panel) => panel.position !== 'header');
  if (openable.length === 0) return null;
  const editorPanels = openable.filter((panel) => panel.position === 'editor');
  const others = openable.filter((panel) => panel.position !== 'editor');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${open ? 'text-ink' : 'text-ink/60 hover:text-ink'}`}
        title="Open a panel plugin"
        aria-label="Open a panel plugin"
        aria-expanded={open}
      >
        <Puzzle size={16} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-1 w-60 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1">
          <div className="px-3 py-1 text-[10px] uppercase font-mono text-ink/40 border-b border-ink/10 mb-1">
            Panel Plugins
          </div>
          {editorPanels.map((panel) => (
            <PanelLauncherRow key={panel.panelKey} panel={panel} onOpen={handleOpen} setOpen={setOpen} />
          ))}
          {editorPanels.length > 0 && others.length > 0 ? (
            <div className="my-1 border-t border-ink/10" />
          ) : null}
          {others.map((panel) => (
            <PanelLauncherRow key={panel.panelKey} panel={panel} onOpen={handleOpen} setOpen={setOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );

  function handleOpen(panelKey: string, title: string) {
    // The file-tabs hook owns the tab strip, so a panel is opened through the
    // same window event a file link uses — one path into the tab list, not two.
    window.dispatchEvent(new CustomEvent('omp:open-panel', { detail: { panelKey, title } }));
  }
}

function PanelLauncherRow({
  panel,
  onOpen,
  setOpen,
}: {
  panel: PanelRegistryEntry;
  onOpen: (panelKey: string, title: string) => void;
  setOpen: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onOpen(panel.panelKey, panel.title);
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink/5 cursor-pointer"
    >
      {panel.icon ? (
        <img src={panelAssetUrl(panel.panelKey, panel.icon)} alt="" className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <Puzzle size={13} className="flex-shrink-0 text-ink/50" />
      )}
      <span className="truncate">{panel.title}</span>
      <span className="ml-auto text-[10px] text-ink/40 truncate">
        {panel.position === 'editor' ? panel.pluginName : `${panel.position} → editor`}
      </span>
    </button>
  );
}
