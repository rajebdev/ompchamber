import { Download, Loader2, Store } from 'lucide-preact';
import type { PanelCatalogEntry } from '@/shared/types';

interface AvailableListProps {
  entries: PanelCatalogEntry[];
  busy: string | null;
  onInstall: (pluginId: string) => Promise<boolean>;
}

/**
 * What the bundled marketplace OFFERS.
 *
 * This list is the store: a plugin the package ships is available here and
 * nothing more until the user installs it. That is deliberately the same shape
 * VS Code uses — an extension is not installed until you install it — and it is
 * why a fresh chamber starts with an empty activity bar rather than with
 * whatever the package happens to bundle.
 *
 * Each row names what the plugin would contribute, because "install" is a
 * decision about a button and a tab the user has not seen yet.
 */
export function AvailableList({ entries, busy, onInstall }: AvailableListProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border border-ink/10 rounded">
      <div className="px-3 py-2 border-b border-ink/10 flex items-center gap-2">
        <Store size={14} className="text-ink/50 flex-shrink-0" />
        <span className="text-sm font-medium text-ink">Available from OMPChamber</span>
        <span className="ml-auto text-[11px] text-ink/50">
          {entries.length} plugin{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {entries.map((entry) => (
          <div key={entry.pluginId} className="border border-ink/10 rounded p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink">{entry.name}</span>
              <span className="text-[11px] text-ink/50">v{entry.version}</span>
              <span className="text-[10px] font-mono text-ink/40">{entry.pluginId}</span>
              <button
                type="button"
                onClick={() => void onInstall(entry.pluginId)}
                disabled={busy !== null}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-ink/15 hover:bg-ink/5 disabled:opacity-40 flex-shrink-0"
              >
                {busy === `install:${entry.pluginId}` ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Download size={11} />
                )}
                Install
              </button>
            </div>
            {entry.description ? (
              <p className="mt-1 text-[11px] text-ink/60">{entry.description}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              {entry.panels.map((panel) => (
                <span key={panel.id} className="flex items-center gap-1">
                  <span className="text-ink/70">{panel.title}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink/60">
                    {panel.position}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
