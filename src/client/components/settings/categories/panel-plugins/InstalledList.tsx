import { Hammer, Loader2, Package } from 'lucide-preact';
import type { PanelPluginStatus, PanelRegistryEntry } from '@/shared/types';
import { RemovePluginButton } from '@/client/components/settings/categories/panel-plugins/InstallForm';

interface InstalledListProps {
  /** Every installed plugin, in scan order. */
  plugins: PanelPluginStatus[];
  /** Contributions by plugin id — EMPTY for a plugin that is switched off. */
  panelsByPlugin: Map<string, PanelRegistryEntry[]>;
  busy: string | null;
  onBuild: (pluginId: string) => Promise<boolean>;
  onRemove: (pluginId: string) => Promise<boolean>;
  onSetEnabled: (pluginId: string, enabled: boolean) => Promise<boolean>;
}

/**
 * The plugins that are INSTALLED, with the switch that turns each one on or off.
 *
 * Rows come from the installed list, NOT from the contributed panels: a plugin
 * that is switched off publishes no panels at all, so a list built from panels
 * would make the plugin the user just disabled disappear — the one row they
 * need in order to switch it back on.
 *
 * Enable and install are separate steps, and the pane says so: an installed
 * plugin whose switch is off has its files on disk and contributes nothing —
 * no activity-bar button, no header button, no editor tab.
 */
export function InstalledList({ plugins, panelsByPlugin, busy, onBuild, onRemove, onSetEnabled }: InstalledListProps) {
  return (
    <div className="border border-ink/10 rounded">
      <div className="px-3 py-2 border-b border-ink/10 flex items-center gap-2">
        <Package size={14} className="text-ink/50 flex-shrink-0" />
        <span className="text-sm font-medium text-ink">Installed</span>
        <span className="ml-auto text-[11px] text-ink/50">
          {plugins.length} plugin{plugins.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {plugins.map((plugin) => {
          const panels = panelsByPlugin.get(plugin.pluginId) ?? [];
          const toggling = busy === `enable:${plugin.pluginId}` || busy === `disable:${plugin.pluginId}`;
          return (
            <div key={plugin.pluginId} className="border border-ink/10 rounded p-2.5">
              <div className="flex items-center gap-2">
                <Package size={13} className="text-ink/50 flex-shrink-0" />
                <span className="text-xs font-medium text-ink">{plugin.name}</span>
                <span className="text-[10px] font-mono text-ink/40">{plugin.pluginId}</span>
                {plugin.bundled ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink/50">bundled</span>
                ) : null}
                {!plugin.enabled ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink/50">Disabled</span>
                ) : null}
                <span className="ml-auto flex items-center gap-1">
                  {!plugin.built ? (
                    <button
                      type="button"
                      onClick={() => void onBuild(plugin.pluginId)}
                      disabled={busy !== null}
                      title={plugin.reason ? `Rebuild — ${plugin.reason}` : 'Rebuild this plugin'}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-ink/15 hover:bg-ink/5 disabled:opacity-40"
                    >
                      {busy === `build:${plugin.pluginId}` ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Hammer size={11} />
                      )}
                      Rebuild
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plugin.enabled}
                    aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
                    disabled={busy !== null}
                    onClick={() => void onSetEnabled(plugin.pluginId, !plugin.enabled)}
                    title={plugin.enabled ? 'Disable — keep the files, remove its buttons' : 'Enable this plugin'}
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
                      plugin.enabled ? 'bg-ink/70' : 'bg-ink/20'
                    }`}
                  >
                    {toggling ? (
                      <Loader2 size={9} className="absolute inset-0 m-auto animate-spin text-canvas" />
                    ) : (
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-canvas transition-all ${
                          plugin.enabled ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    )}
                  </button>
                  <RemovePluginButton pluginId={plugin.pluginId} disabled={busy !== null} onRemove={onRemove} />
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {panels.length === 0 ? (
                  <p className="text-[11px] text-ink/45">
                    Disabled — no panels are contributed while the switch is off.
                  </p>
                ) : (
                  panels.map((panel) => (
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
                  ))
                )}
              </div>
              {/* An unbuilt plugin is a distinct state from a rejected one:
                  the manifest is fine and the build is what is missing, so
                  the reason and the Rebuild action belong on the row. */}
              {!plugin.built ? (
                <p className="mt-1.5 text-[11px] text-warning">
                  Not built{plugin.reason ? ` — ${plugin.reason}` : ''}. Panels will 404 until it is built.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
