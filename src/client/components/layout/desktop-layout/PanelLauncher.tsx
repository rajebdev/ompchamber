import { useRef, useState } from 'preact/hooks';
import { usePanelRegistry, usePanelSlots } from '@/client/hooks/workspace/panel-registry';
import { panelOf, rightPanelOf } from '@/client/lib/plugins/slots';
import { pluginPanelKey } from '@/shared/lib/workspace/panel-ids';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { PluginMark } from '@/client/components/settings/categories/panel-plugins/PluginMark';

/**
 * The navbar entry point for panels that can occupy the `panel` slot.
 *
 * A right-panel plugin gets an activity-bar button, but a `panel` has no such
 * home — it takes over the editor column. The menu is hidden entirely when no
 * plugin contributes a view, so a user with no panel plugins sees an unchanged
 * navbar.
 *
 * The list is every plugin that registered either a `panel` or a `rightPanel`,
 * not only the ones whose registration named `panel`. A registration's slot
 * decides where a view appears BY DEFAULT; the column is generic and can hold
 * any view, which is what lets a user move a right-panel plugin into the column
 * without the author having to register it twice. A `header` is the exception:
 * it is a navbar entry, not a view.
 *
 * The trigger is NOT a puzzle piece. A generic glyph here would be the one
 * surface drawing an abstract "plugin" while every other one — the activity
 * bar, the editor tab, the store and installed cards — draws the plugin's own
 * mark. With one view it therefore IS that mark; with several they are drawn
 * side by side, and the button carries the count, because a single mark cannot
 * stand for a set without claiming to be one of them.
 */
export function PanelLauncher({ onOpenPanel }: { onOpenPanel: (panelKey: string) => void }) {
  const { panels } = usePanelRegistry();
  const { slots } = usePanelSlots();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const entries: { pluginId: string; title: string; iconUrl?: string; hasPanelSlot: boolean }[] = [];
  for (const panel of panels) {
    const entry = slots.get(panel.pluginId);
    if (!entry) continue;
    if (!panelOf(entry) && !rightPanelOf(entry)) continue;
    entries.push({
      pluginId: panel.pluginId,
      title: entry.titles.panel ?? entry.titles.rightPanel ?? panel.name,
      ...(panel.iconUrl ? { iconUrl: panel.iconUrl } : {}),
      hasPanelSlot: Boolean(panelOf(entry)),
    });
  }

  if (entries.length === 0) return null;

  const panelFirst = [...entries].sort((a, b) => Number(b.hasPanelSlot) - Number(a.hasPanelSlot));

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
        {entries.length === 1 ? (
          <PluginMark name={entries[0].title} iconUrl={entries[0].iconUrl} size={16} />
        ) : (
          <span className="flex items-center gap-0.5">
            {entries.slice(0, 3).map((entry) => (
              <PluginMark key={entry.pluginId} name={entry.title} iconUrl={entry.iconUrl} size={14} />
            ))}
            <span className="ml-0.5 text-[10px] font-mono text-ink/50 leading-none">{entries.length}</span>
          </span>
        )}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-1 w-60 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1">
          <div className="px-3 py-1 text-[10px] uppercase font-mono text-ink/40 border-b border-ink/10 mb-1">
            Panel Plugins
          </div>
          {panelFirst.map((entry) => (
            <button
              key={entry.pluginId}
              type="button"
              onClick={() => {
                setOpen(false);
                // One call into the layout, which owns both the column and the
                // right panel — the two places a view can live.
                onOpenPanel(pluginPanelKey(entry.pluginId));
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink/5 cursor-pointer"
            >
              <PluginMark name={entry.title} iconUrl={entry.iconUrl} size={14} />
              <span className="truncate">{entry.title}</span>
              <span className="ml-auto text-[10px] text-ink/40 truncate">
                {entry.hasPanelSlot ? entry.pluginId : `${entry.pluginId} → panel`}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
