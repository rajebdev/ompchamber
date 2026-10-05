import { AlertTriangle, Hammer, Loader2, Package, RefreshCw, Store } from 'lucide-preact';
import { PANELS_CHANGED_EVENT, usePanelPluginActions, usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { InstallForm, RemovePluginButton } from '@/client/components/settings/categories/panel-plugins/InstallForm';

/**
 * The panel-plugin marketplace: what is installed, and how to change it.
 *
 * There is one marketplace and it holds the bundled plugins plus anything
 * installed from a git URL, so this pane is the whole install surface — no
 * marketplace picker, because there is nothing to pick between.
 *
 * Its most important job is reporting what it REFUSED. A plugin that fails to
 * load with no reason reads as a plugin that was never installed, which is the
 * single most confusing failure this surface can have — and an install writes
 * two things (a directory and a catalog entry), so a half-finished one has to
 * be visible rather than inferred.
 */
export function PanelPluginsSection() {
  const { panels, marketplaces, errors, plugins, ready } = usePanelRegistry();
  const actions = usePanelPluginActions();

  const refresh = () => window.dispatchEvent(new CustomEvent(PANELS_CHANGED_EVENT, { detail: { force: true } }));
  const marketplace = marketplaces[0];

  // The scan tags each rejection with its marketplace, so grouping is a value
  // lookup. An untagged rejection is listed at the end rather than dropped.
  const owned = panels.filter((panel) => !marketplace || panel.marketplace === marketplace.id);
  const rejected = errors.filter((error) => !marketplace || error.marketplace === marketplace.id);
  const unclaimed = errors.filter((error) => !error.marketplace);

  // One row per PLUGIN, not per panel: a plugin may contribute several views,
  // and removing is a per-directory action.
  const byPlugin = new Map<string, typeof owned>();
  for (const panel of owned) {
    const list = byPlugin.get(panel.pluginId) ?? [];
    list.push(panel);
    byPlugin.set(panel.pluginId, list);
  }

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

      {ready && owned.length === 0 && rejected.length === 0 && unclaimed.length === 0 ? (
        <div className="text-xs text-ink/60 space-y-1.5">
          <p>No panel plugins installed.</p>
          <p className="font-mono text-[11px] text-ink/45 leading-relaxed">
            ~/.ompchamber/marketplace/marketplace.json
            <br />
            ~/.ompchamber/marketplace/plugins/&lt;plugin&gt;/ompchamber.json
          </p>
        </div>
      ) : null}

      {byPlugin.size > 0 ? (
        <div className="border border-ink/10 rounded">
          <div className="px-3 py-2 border-b border-ink/10 flex items-center gap-2">
            <Store size={14} className="text-ink/50 flex-shrink-0" />
            <span className="text-sm font-medium text-ink">{marketplace?.name ?? 'Marketplace'}</span>
            <span className="ml-auto text-[11px] text-ink/50">
              {byPlugin.size} plugin{byPlugin.size === 1 ? '' : 's'}
            </span>
          </div>
          {marketplace?.description ? (
            <p className="px-3 pt-2 text-xs text-ink/60">{marketplace.description}</p>
          ) : null}
          <div className="p-3 space-y-2">
            {[...byPlugin.entries()].map(([pluginId, pluginPanels]) => {
              const status = plugins.find((entry) => entry.pluginId === pluginId);
              return (
              <div key={pluginId} className="border border-ink/10 rounded p-2.5">
                <div className="flex items-center gap-2">
                  <Package size={13} className="text-ink/50 flex-shrink-0" />
                  <span className="text-xs font-medium text-ink">{pluginPanels[0].pluginName}</span>
                  <span className="text-[11px] text-ink/50">v{pluginPanels[0].pluginVersion}</span>
                  <span className="text-[10px] font-mono text-ink/40">{pluginId}</span>
                  <span className="ml-auto">
                    <span className="flex items-center gap-1">
                      {status && !status.built ? (
                        <button
                          type="button"
                          onClick={() => void actions.build(pluginId)}
                          disabled={actions.busy !== null}
                          title={status.reason ? `Rebuild — ${status.reason}` : 'Rebuild this plugin'}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-ink/15 hover:bg-ink/5 disabled:opacity-40"
                        >
                          {actions.busy === `build:${pluginId}` ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Hammer size={11} />
                          )}
                          Rebuild
                        </button>
                      ) : null}
                      <RemovePluginButton
                        pluginId={pluginId}
                        disabled={actions.busy !== null}
                        onRemove={actions.remove}
                      />
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {pluginPanels.map((panel) => (
                    <div key={panel.panelKey} className="flex items-center gap-2 text-[11px]">
                      <span className="text-ink/70">{panel.title}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink/60">
                        {panel.position}
                      </span>
                      <span className="font-mono text-ink/40 truncate">{panel.panelKey}</span>
                      <span className="text-ink/45 ml-auto flex-shrink-0">
                        {panel.capabilities.length > 0 ? panel.capabilities.join(', ') : 'no capabilities'}
                      </span>
                    </div>
                  ))}
                </div>
                {/* An unbuilt plugin is a distinct state from a rejected one:
                    the manifest is fine and the build is what is missing, so
                    the reason and the Rebuild action belong on the row. */}
                {status && !status.built ? (
                  <p className="mt-1.5 text-[11px] text-warning">
                    Not built{status.reason ? ` — ${status.reason}` : ''}. Panels will 404 until it is built.
                  </p>
                ) : null}
              </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {rejected.map((error) => (
        <div key={error.dir} className="border border-error/30 rounded p-3">
          <div className="flex items-center gap-2 text-error">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="text-xs">Rejected</span>
          </div>
          <div className="mt-1 text-[11px] font-mono text-ink/50 break-all">{error.dir}</div>
          <div className="mt-1 text-xs text-ink/70">{error.reason}</div>
        </div>
      ))}

      {unclaimed.map((error) => (
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
