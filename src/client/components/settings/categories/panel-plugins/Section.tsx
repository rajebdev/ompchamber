import { AlertTriangle, RefreshCw } from 'lucide-preact';
import {
  PANELS_CHANGED_EVENT,
  usePanelPluginActions,
  usePanelRegistry,
  usePanelSlots,
} from '@/client/hooks/workspace/panel-registry';
import { InstallForm } from '@/client/components/settings/categories/panel-plugins/InstallForm';
import { AvailableList } from '@/client/components/settings/categories/panel-plugins/AvailableList';
import { InstalledList } from '@/client/components/settings/categories/panel-plugins/InstalledList';

/**
 * The panel-plugin marketplace: what is available, what is installed, and how
 * to change either.
 *
 * Three lists, and the split between them is the feature. **Available** is the
 * bundled marketplace — a STORE, so a plugin the package ships is an offer and
 * nothing more until the user installs it (VS Code's model). **Installed** is
 * what is on disk, each row carrying the switch that turns its contributions on
 * or off without deleting anything, and the slots its bundle registered.
 * Rejections are listed last, because a plugin that fails to load with no reason
 * reads as a plugin that was never installed — the single most confusing
 * failure this surface can have.
 *
 * The installed rows come from the INSTALLED list rather than from the
 * registrations: a plugin that is switched off publishes no component, so a
 * registration-derived list would drop the row the user needs to switch it back
 * on.
 */
export function PanelPluginsSection() {
  const { panels, errors, plugins, catalog, ready } = usePanelRegistry();
  const { slots, failures } = usePanelSlots();
  const actions = usePanelPluginActions();

  const refresh = () => window.dispatchEvent(new CustomEvent(PANELS_CHANGED_EVENT, { detail: { force: true } }));

  const available = catalog.filter((entry) => !entry.installed);
  const failureMap = new Map(failures.map((failure) => [failure.pluginId, failure.reason]));
  // An installed plugin's icon and README, for the card. Both come from the
  // registry rather than from the manifest, because the URLs are
  // content-addressed server-side.
  const iconUrls = new Map(panels.map((panel) => [panel.pluginId, panel.iconUrl]));
  const readmeUrls = new Map(panels.map((panel) => [panel.pluginId, panel.readmeUrl]));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink/60 max-w-xl">
          Panels bundled with OMPChamber, plus the ones you install from a git URL. A plugin is local code the
          chamber loads into this page and renders in its own tree, so it looks and behaves like the rest of the
          app — treat it the way you would a VS Code extension.
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
            ~/.ompchamber/marketplace/plugins/&lt;plugin&gt;/package.json
          </p>
        </div>
      ) : null}

      <AvailableList entries={available} busy={actions.busy} onInstall={actions.installBundled} />

      {plugins.length > 0 ? (
        <InstalledList
          plugins={plugins}
          slots={slots}
          failures={failureMap}
          iconUrls={iconUrls}
          readmeUrls={readmeUrls}
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
