import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { DEFAULT_PROVIDERS_LIST, PRESET_NEW_PROVIDERS } from '@/client/data/settings/provider';
import { isMockMode } from '@/server/mock.server';
import type { ProviderItem } from '@/shared/types';
import { createSettingsListStore } from '@/server/lib/db/settings-store';
import { disableNativeProvider, enableNativeProvider } from '@/server/lib/omp/config/disabled-providers';
import { PROVIDERS_SETTINGS_KEY as SETTINGS_KEY, deduplicateProviderItems, mergeProviders } from '@/server/lib/models/provider-registry.server';
import { invalidateModelsCaches } from '@/shared/lib/models/server-cache';

const providersStore = createSettingsListStore<ProviderItem>({
  key: SETTINGS_KEY,
  mockDefaults: DEFAULT_PROVIDERS_LIST,
  idOf: (provider) => provider.id,
  singular: 'provider',
  plural: 'providers',
});

async function readStoredProviders(): Promise<ProviderItem[]> {
  const db = await getDb();
  return providersStore.readStored(db, { absent: [] });
}

async function writeStoredProviders(providers: ProviderItem[]): Promise<void> {
  const db = await getDb();
  await providersStore.write(db, providers);
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
    if (enabled) await enableNativeProvider(slug);
    else await disableNativeProvider(slug);
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
    const mock = isMockMode();
    const providers = deduplicateProviderItems(await providersStore.read(db));

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

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      const list = await providersStore.remove(db, id, { absent: DEFAULT_PROVIDERS_LIST, empty: DEFAULT_PROVIDERS_LIST });
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

      const updatedProviders = await providersStore.upsert(db, body, { absent: DEFAULT_PROVIDERS_LIST, empty: DEFAULT_PROVIDERS_LIST });
      await providersStore.write(db, updatedProviders);
      return respondWithProviders(updatedProviders);
    }

    return methodNotAllowed({ request, params });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
