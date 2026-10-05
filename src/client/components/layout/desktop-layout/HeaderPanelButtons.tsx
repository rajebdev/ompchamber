import { useEffect, useRef, useState } from 'preact/hooks';
import { Puzzle } from 'lucide-preact';
import { usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { panelAssetUrl } from '@/shared/lib/panels/asset-base';
import { PluginPanelView } from '@/client/components/workspace/panel-host/view';
import type { PanelRegistryEntry } from '@/shared/types';

interface HeaderPanelButtonsProps {
  workspacePath: string | null;
}

/**
 * The navbar buttons a plugin's `header` panel contributes — DESKTOP ONLY.
 *
 * A header panel is a small stats readout that expands into a dropdown when
 * clicked, which is a desktop shape: a phone's navbar has no room for it, and
 * the phone's right-side drawer already carries every view. The navbars are
 * separate components for that reason, and this one is simply not rendered on
 * the mobile layout.
 *
 * Exactly ONE dropdown is open at a time, across every plugin. Two open panels
 * would overlap (the dropdowns are anchored to their own button, but the
 * navbar is a single row) and the second would cover the first, so the open
 * panel is held here as one id rather than as a flag per button.
 *
 * A plugin contributes AT MOST ONE header panel — the manifest refuses a second
 * — so one plugin cannot produce two buttons here.
 */
export function HeaderPanelButtons({ workspacePath }: HeaderPanelButtonsProps) {
  const { panels } = usePanelRegistry();
  const headerPanels = panels.filter((panel) => panel.position === 'header');
  const [openKey, setOpenKey] = useState<string | null>(null);

  // A panel that is uninstalled or switched off while its dropdown is open
  // would leave an empty box on screen; closing is the honest answer.
  useEffect(() => {
    if (openKey && !headerPanels.some((panel) => panel.panelKey === openKey)) setOpenKey(null);
  }, [headerPanels, openKey]);

  if (headerPanels.length === 0) return null;

  return (
    <div className="flex items-center space-x-1">
      {headerPanels.map((panel) => (
        <HeaderPanelButton
          key={panel.panelKey}
          panel={panel}
          open={openKey === panel.panelKey}
          workspacePath={workspacePath}
          onToggle={() => setOpenKey((current) => (current === panel.panelKey ? null : panel.panelKey))}
          onClose={() => setOpenKey(null)}
        />
      ))}
    </div>
  );
}

interface HeaderPanelButtonProps {
  panel: PanelRegistryEntry;
  open: boolean;
  workspacePath: string | null;
  onToggle: () => void;
  onClose: () => void;
}

function HeaderPanelButton({ panel, open, workspacePath, onToggle, onClose }: HeaderPanelButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, onClose);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${open ? 'text-ink' : 'text-ink/60 hover:text-ink'}`}
        title={`${panel.title} — ${panel.pluginName}`}
        aria-label={`${panel.title} (plugin ${panel.pluginName})`}
        aria-expanded={open}
      >
        {panel.icon ? (
          <img src={panelAssetUrl(panel.panelKey, panel.icon)} alt="" className="w-4 h-4" />
        ) : (
          <Puzzle size={16} />
        )}
      </button>

      {open ? (
        // A plugin header is a real frame, not a summary the host draws: the
        // plugin owns its readout and its markup, exactly as it does for a
        // right-panel view. The frame is mounted ONLY while open, so a closed
        // header costs no plugin process.
        <div className="absolute right-0 top-full mt-1 w-80 h-64 bg-paper border border-ink/15 rounded shadow-lg z-50 overflow-hidden">
          <PluginPanelView panelKey={panel.panelKey} active workspacePath={workspacePath} />
        </div>
      ) : null}
    </div>
  );
}
