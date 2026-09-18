import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';
import { DEFAULT_PROVIDERS_LIST, PRESET_NEW_PROVIDERS } from '@/client/data/settings/provider';
import { isMockMode } from '@/server/mock.server';
import type { ProviderItem } from '@/shared/types';
import { disableNativeProvider, enableNativeProvider } from '@/server/lib/omp/config/disabled-providers';
import { PROVIDERS_SETTINGS_KEY as SETTINGS_KEY, deduplicateProviderItems, mergeProviders } from '@/server/lib/models/provider-registry.server';
import { invalidateModelsCaches } from '@/shared/lib/models/server-cache';

async function readStoredProviders(): Promise<ProviderItem[]> {
  const db = await getDb();
  const row = await db.get<{ value?: string }>('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredProviders(providers: ProviderItem[]): Promise<void> {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
    SETTINGS_KEY,
    JSON.stringify(providers),
  ]);
}

/**
 * Every provider mutation reshapes what the chat picker may offer, so both the
 * registry and the model-list caches are dropped on the way out.
 */
function respondWithProviders(providers: ProviderItem[], extra: Record<string, unknown> = {}) {
  invalidateModelsCaches();
  return json({ success: true, providers, ...extra });
}

/**
 * Connect / disconnect. The flag is written to omp's OWN registry
 * (config.yml disabledProviders) rather than the local overlay, because the
 * overlay is re-merged away on the next load — which is why a disconnect used
 * to come back as "connected".
 */
async function setProviderEnabled(slug: string, enabled: boolean): Promise<Response> {
  const mock = isMockMode();
  if (!mock) {
    if (enabled) enableNativeProvider(slug);
    else disableNativeProvider(slug);
  }
  // Must precede the merge: loadRpcProviderItems serves its 60s snapshot, so a
  // warm cache would rebuild the list against the OLD disabledProviders set.
  invalidateModelsCaches();
  const stored = await readStoredProviders();
  if (mock) {
    const target = slug.trim().toLowerCase();
    const updated = stored.map((provider) => (
      provider.slug.trim().toLowerCase() === target
        ? { ...provider, status: enabled ? ('connected' as const) : ('disconnected' as const) }
        : provider
    ));
    await writeStoredProviders(updated);
    return respondWithProviders(updated);
  }
  return respondWithProviders((await mergeProviders(stored)).providers);
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let providers: ProviderItem[] = mock ? DEFAULT_PROVIDERS_LIST : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          providers = parsed;
        }
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_PROVIDERS_LIST),
      ]);
    }

    providers = deduplicateProviderItems(providers);

    if (!mock) {
      const merged = await mergeProviders(providers);
      return json({
        providers: merged.providers,
        presetProviders: PRESET_NEW_PROVIDERS,
        isMock: mock,
        modelsConfigPath: merged.modelsConfigPath,
      });
    }

    return json({
      providers,
      presetProviders: PRESET_NEW_PROVIDERS,
      isMock: mock,
    });
  } catch (error: any) {
    const mock = isMockMode();
    return json({
      error: error.message,
      providers: mock ? DEFAULT_PROVIDERS_LIST : [],
      presetProviders: PRESET_NEW_PROVIDERS,
      isMock: mock,
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      const stored = await readStoredProviders();
      const list = (stored.length > 0 ? stored : DEFAULT_PROVIDERS_LIST).filter(p => p.id !== id);
      await writeStoredProviders(list);
      return respondWithProviders(list);
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();

      if (typeof body.disableProvider === 'string') {
        return await setProviderEnabled(body.disableProvider, false);
      }
      if (typeof body.enableProvider === 'string') {
        return await setProviderEnabled(body.enableProvider, true);
      }

      let updatedProviders: ProviderItem[] = [];

      if (Array.isArray(body)) {
        updatedProviders = body;
      } else if (Array.isArray(body.providers)) {
        updatedProviders = body.providers;
      } else if (body.provider) {
        const stored = await readStoredProviders();
        const list = stored.length > 0 ? stored : DEFAULT_PROVIDERS_LIST;
        const idx = list.findIndex(p => p.id === body.provider.id);
        if (idx >= 0) {
          list[idx] = body.provider;
        } else {
          list.push(body.provider);
        }
        updatedProviders = list;
      }

      await writeStoredProviders(updatedProviders);
      return respondWithProviders(updatedProviders);
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
