import { AlertTriangle, RefreshCw } from 'lucide-preact';
import { PANELS_CHANGED_EVENT, usePanelPluginActions, usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { InstallForm } from '@/client/components/settings/categories/panel-plugins/InstallForm';
import { AvailableList } from '@/client/components/settings/categories/panel-plugins/AvailableList';
import { InstalledList } from '@/client/components/settings/categories/panel-plugins/InstalledList';
import type { PanelRegistryEntry } from '@/shared/types';

/**
 * The panel-plugin marketplace: what is available, what is installed, and how
 * to change either.
 *
 * Three lists, and the split between them is the feature. **Available** is the
 * bundled marketplace — a STORE, so a plugin the package ships is an offer and
 * nothing more until the user installs it (VS Code's model). **Installed** is
 * what is on disk, each row carrying the switch that turns its contributions on
 * or off without deleting anything. Rejections are listed last, because a
 * plugin that fails to load with no reason reads as a plugin that was never
 * installed — the single most confusing failure this surface can have.
 *
 * The installed rows come from the INSTALLED list rather than from the
 * contributed panels: a plugin that is switched off publishes no panels, so a
 * panel-derived list would drop the row the user needs to switch it back on.
 */
export function PanelPluginsSection() {
  const { panels, errors, plugins, catalog, ready } = usePanelRegistry();
  const actions = usePanelPluginActions();

  const refresh = () => window.dispatchEvent(new CustomEvent(PANELS_CHANGED_EVENT, { detail: { force: true } }));

  // Contributions grouped by plugin, for the installed rows that have any.
  const panelsByPlugin = new Map<string, PanelRegistryEntry[]>();
  for (const panel of panels) {
    const list = panelsByPlugin.get(panel.pluginId) ?? [];
    list.push(panel);
    panelsByPlugin.set(panel.pluginId, list);
  }

  const available = catalog.filter((entry) => !entry.installed);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink/60 max-w-xl">
          Panels bundled with OMPChamber, plus the ones you install from a git URL. Each panel runs in its own
          sandboxed frame and reaches the chamber only through the capabilities its manifest declares.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-ink/15 hover:bg-ink/5 flex-shrink-0"
          title="Re-read the marketplace from disk"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <InstallForm
        busy={actions.busy === 'install'}
        error={actions.error}
        onInstall={actions.install}
        onClearError={actions.clearError}
      />

      {!ready ? <p className="text-xs text-ink/50">Reading…</p> : null}

      {ready && available.length === 0 && plugins.length === 0 && errors.length === 0 ? (
        <div className="text-xs text-ink/60 space-y-1.5">
          <p>No panel plugins installed.</p>
          <p className="font-mono text-[11px] text-ink/45 leading-relaxed">
            ~/.ompchamber/marketplace/marketplace.json
            <br />
            ~/.ompchamber/marketplace/plugins/&lt;plugin&gt;/ompchamber.json
          </p>
        </div>
      ) : null}

      <AvailableList entries={available} busy={actions.busy} onInstall={actions.installBundled} />

      {plugins.length > 0 ? (
        <InstalledList
          plugins={plugins}
          panelsByPlugin={panelsByPlugin}
          busy={actions.busy}
          onBuild={actions.build}
          onRemove={actions.remove}
          onSetEnabled={actions.setEnabled}
        />
      ) : null}

      {errors.map((error) => (
        <div key={error.dir + error.reason} className="border border-error/30 rounded p-3">
          <div className="flex items-center gap-2 text-error">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="text-xs">Rejected</span>
          </div>
          <div className="mt-1 text-[11px] font-mono text-ink/50 break-all">{error.dir}</div>
          <div className="mt-1 text-xs text-ink/70">{error.reason}</div>
        </div>
      ))}
    </div>
  );
}
