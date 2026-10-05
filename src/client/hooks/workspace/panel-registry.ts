/**
 * The installed panel plugins, fetched once per layout and shared.
 *
 * The registry is a server read, so it is cached in a module-level promise the
 * way the repo list is: every consumer (the activity bar, the panel stack, the
 * mobile tab bar) needs the same list, and re-fetching per consumer would put
 * three requests behind one page load and let them disagree while one is in
 * flight.
 *
 * The cache is invalidated by the `omp:panels-changed` event, which the panel
 * settings surface dispatches after a plugin file is written. A reload of the
 * page naturally refetches.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  PanelCatalogEntry,
  PanelMarketplaceItem,
  PanelPluginStatus,
  PanelRegistryEntry,
  PanelRegistryPayload,
} from '@/shared/types';

/** Dispatched after a panel plugin is installed, removed or edited. */
export const PANELS_CHANGED_EVENT = 'omp:panels-changed';

interface PanelRegistryState {
  /** Contributions of ENABLED plugins — what the layouts render from. */
  panels: PanelRegistryEntry[];
  marketplaces: PanelMarketplaceItem[];
  errors: PanelRegistryPayload['errors'];
  /** Build and enablement state per installed plugin. */
  plugins: PanelPluginStatus[];
  /** The bundled marketplace's offers, installed or not. */
  catalog: PanelCatalogEntry[];
  /** False until the first read settles, so a view can hold its placeholder. */
  ready: boolean;
}

const EMPTY: PanelRegistryPayload = { panels: [], marketplaces: [], errors: [], plugins: [], catalog: [] };

let cached: Promise<PanelRegistryPayload> | null = null;

function fetchRegistry(force: boolean): Promise<PanelRegistryPayload> {
  // A forced read bypasses the shared promise as well as the server's cache: the
  // point of the button is to see the disk NOW, and reusing an in-flight read
  // that started before the plugin was written would answer with the old list.
  if (force) {
    cached = null;
  }
  cached ??= fetch(force ? '/api/panels?refresh=1' : '/api/panels', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : EMPTY))
    .catch(() => EMPTY)
    .then((payload: PanelRegistryPayload) => payload);
  return cached;
}

/** Drop the shared cache so the next read reflects the disk. */
export function invalidatePanelRegistry(): void {
  cached = null;
}

/**
 * Seed the shared cache with a payload a mutation already returned.
 *
 * Without this the event handler would force a second read, and the two answers
 * could differ — the mutation's response is the server's state at the moment the
 * write committed, which is strictly better than a re-read that races it.
 */
export function seedPanelRegistry(payload: PanelRegistryPayload): void {
  cached = Promise.resolve(payload);
}

export function usePanelRegistry(): PanelRegistryState {
  const [state, setState] = useState<PanelRegistryState>({ ...EMPTY, ready: false });

  const read = useCallback((force = false) => {
    let cancelled = false;
    fetchRegistry(force).then((payload) => {
      if (cancelled) return;
      setState({
        panels: payload.panels ?? [],
        marketplaces: payload.marketplaces ?? [],
        errors: payload.errors ?? [],
        plugins: payload.plugins ?? [],
        catalog: payload.catalog ?? [],
        ready: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The initial read reuses the cache: several consumers mount together and the
  // list is the same for all of them.
  useEffect(() => read(false), [read]);

  // Two kinds of "changed", and they need different reads. A MUTATION already
  // has the server's post-write payload seeded into the cache, so it re-reads
  // without forcing — forcing would throw that answer away and race a fresh
  // fetch. A manual Refresh has no payload, so its event carries `force` and
  // the read goes back to the disk.
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ force?: boolean }>).detail;
      read(detail?.force === true);
    };
    window.addEventListener(PANELS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PANELS_CHANGED_EVENT, onChange);
  }, [read]);

  return state;
}

/** One panel by key, for a view that has the id but not the entry. */
export function usePanelEntry(panelKey: string): { panel?: PanelRegistryEntry; ready: boolean } {
  const { panels, ready } = usePanelRegistry();
  return { panel: panels.find((entry) => entry.panelKey === panelKey), ready };
}

/**
 * A mutation that answers with the WHOLE payload.
 *
 * An install changes the catalog, the panel list and the rejections at once, so
 * adopting the response verbatim is what keeps one source of truth — the
 * alternative is a re-read that can race the write and briefly show a state the
 * server never had.
 */
interface PanelMutationResult {
  ok: boolean;
  error?: string;
  payload?: PanelRegistryPayload;
}

export interface PanelPluginActions {
  /** The action in flight, so a row can show which one is running. */
  busy: string | null;
  error: string | null;
  clearError: () => void;
  /** Install from a git URL. */
  install: (url: string) => Promise<boolean>;
  /** Install one plugin the bundled marketplace offers, by id. */
  installBundled: (pluginId: string) => Promise<boolean>;
  remove: (pluginId: string) => Promise<boolean>;
  build: (pluginId: string) => Promise<boolean>;
  /** Switch a plugin's contributions on or off; its files stay on disk. */
  setEnabled: (pluginId: string, enabled: boolean) => Promise<boolean>;
}

/**
 * A plugin is a Bun package, so its panels are served from a build output. That
 * makes "the manifest is valid but the build has not run" a state a user can be
 * in — a fresh clone, an interrupted install, a source edit — and `build` is the
 * one action that resolves it without re-installing.
 */
async function mutatePanelPlugin(body: Record<string, unknown>): Promise<PanelMutationResult> {
  const endpoint = body.type === 'build' ? '/api/panels/build' : '/api/panels/install';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = (await response.json().catch(() => null)) as
      | (PanelRegistryPayload & { error?: string })
      | null;
    if (!parsed) return { ok: false, error: `Request failed (${response.status})` };
    const { error, ...payload } = parsed;
    if (!response.ok) return { ok: false, error: error ?? `Request failed (${response.status})` };
    // The write invalidated the server's scan cache, so the shared client cache
    // is stale by definition.
    invalidatePanelRegistry();
    return { ok: true, payload };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export function usePanelPluginActions(): PanelPluginActions {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (label: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(label);
    setError(null);
    const result = await mutatePanelPlugin(body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? 'The request failed.');
      return false;
    }
    // Every consumer of the list re-reads from the response, not from a second
    // fetch — the event carries no payload, so the store is seeded first.
    if (result.payload) seedPanelRegistry(result.payload);
    window.dispatchEvent(new CustomEvent(PANELS_CHANGED_EVENT));
    return true;
  }, []);

  const install = useCallback((url: string) => run('install', { type: 'install', url }), [run]);
  const installBundled = useCallback(
    (pluginId: string) => run(`install:${pluginId}`, { type: 'install', pluginId }),
    [run],
  );
  const remove = useCallback((pluginId: string) => run(`remove:${pluginId}`, { type: 'remove', pluginId }), [run]);
  const build = useCallback((pluginId: string) => run(`build:${pluginId}`, { type: 'build', pluginId }), [run]);
  const setEnabled = useCallback(
    (pluginId: string, enabled: boolean) =>
      run(`${enabled ? 'enable' : 'disable'}:${pluginId}`, { type: enabled ? 'enable' : 'disable', pluginId }),
    [run],
  );

  return { busy, error, clearError: () => setError(null), install, installBundled, remove, build, setEnabled };
}
