import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_PROVIDERS_LIST, PRESET_NEW_PROVIDERS } from '@/data/settings/provider';
import { isMockMode } from '@/mock.server';
import type { ProviderItem } from '@/types';
import { readDisabledProviders } from '@/lib/omp/config/roles';
import { enableNativeProvider, getModelsConfigPath, readNativeProviders } from '@/lib/omp/config/providers';
import { runUtilityCommand, type OmpModel } from '@/lib/omp/rpc/utility';

const SETTINGS_KEY = 'omp_providers_config';

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberProvidersRpcCache: { data: ProviderItem[]; expiresAt: number } | undefined;
}
const RPC_CACHE_TTL_MS = 60_000;

interface LoginProvider {
  id: string;
  name: string;
  authenticated: boolean;
}

/**
 * Provider registry straight from the omp agent: authenticated login providers
 * (omp auth) plus their registered models (get_available_models). This is the
 * source the composer's model dropdown already uses via /api/models.
 */
async function loadRpcProviderItems(): Promise<ProviderItem[]> {
  const cached = globalThis.__ompChamberProvidersRpcCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const [loginResponse, modelsResponse] = await Promise.all([
      runUtilityCommand<{ providers?: unknown }>({ type: 'get_login_providers' }, 30_000),
      runUtilityCommand<{ models?: unknown }>({ type: 'get_available_models' }, 60_000),
    ]);
    const loginProviders = Array.isArray(loginResponse.providers)
      ? loginResponse.providers.filter((provider): provider is LoginProvider => (
          typeof provider === 'object' && provider !== null
          && typeof (provider as { id?: unknown }).id === 'string'
          && typeof (provider as { name?: unknown }).name === 'string'
          && typeof (provider as { authenticated?: unknown }).authenticated === 'boolean'
        ))
      : [];
    const available = Array.isArray(modelsResponse.models)
      ? modelsResponse.models.filter((model): model is OmpModel => (
          typeof model === 'object' && model !== null
          && typeof (model as OmpModel).id === 'string'
          && typeof (model as OmpModel).provider === 'string'
        ))
      : [];
    const disabled = (() => {
      try { return readDisabledProviders(); } catch { return new Set<string>(); }
    })();

    const items = loginProviders.map((provider) => {
      const providerModels = available.filter((model) => model.provider === provider.id);
      return {
        id: `omp-auth-${provider.id}`,
        name: provider.name,
        slug: provider.id,
        icon: 'plug',
        status: (provider.authenticated && !disabled.has(provider.id) ? 'connected' : 'disconnected') as ProviderItem['status'],
        configuredIn: 'omp auth credentials',
        models: providerModels.map((model) => ({
          id: model.id,
          name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
          contextWindow: model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K ctx` : '',
          hasTools: true,
          hasVision: false,
          isVisible: true,
        })),
      };
    });
    globalThis.__ompChamberProvidersRpcCache = { data: items, expiresAt: Date.now() + RPC_CACHE_TTL_MS };
    return items;
  } catch {
    // RPC unavailable (cold start / omp busy) — degrade to the remaining sources.
    return [];
  }
}

/**
 * Build a disabled-native ProviderItem for a provider the omp agent reports as
 * disabled (config.yml disabledProviders). The UI treats these as
 * "disconnected" — re-enabling via POST { enableProvider } flips config.yml.
 */
function disabledProviderItem(slug: string): ProviderItem {
  return {
    id: `omp-disabled-${slug}`,
    name: slug,
    slug,
    icon: 'plug',
    status: 'disconnected',
    configuredIn: 'omp disabledProviders',
    models: [],
  };
}

/**
 * Native provider entry discovered from models.yml. Credentials never leave
 * omp's own stores — chamber only surfaces registration info.
 */
function nativeProviderItem(
  slug: string,
  baseUrl: string | undefined,
  modelIds: string[],
  status: ProviderItem['status'] = 'connected',
): ProviderItem {
  return {
    id: `omp-native-${slug}`,
    name: slug,
    slug,
    icon: 'plug',
    status,
    configuredIn: baseUrl ? `models.yml · ${baseUrl}` : 'models.yml',
    models: modelIds.map((modelId) => ({
      id: modelId,
      name: modelId,
      contextWindow: '',
      hasTools: true,
      hasVision: false,
      isVisible: true,
    })),
  };
}

function providerIdentityKey(provider: ProviderItem): string {
  const slug = provider.slug.trim().toLowerCase();
  const name = provider.name.trim().toLowerCase();
  const baseUrl = provider.baseUrl?.trim().toLowerCase() || '';
  if (slug === 'kenari' || name.includes('kenari') || baseUrl.includes('kenari.id')) return 'kenari';
  return slug;
}

function mergeProviderItems(existing: ProviderItem, incoming: ProviderItem): ProviderItem {
  const primary = existing.id.startsWith('omp-auth-') || !incoming.id.startsWith('omp-auth-')
    ? existing
    : incoming;
  const secondary = primary === existing ? incoming : existing;
  const knownModelIds = new Set<string>();
  const models = [...primary.models, ...secondary.models].filter((model) => {
    if (knownModelIds.has(model.id)) return false;
    knownModelIds.add(model.id);
    return true;
  });

  return {
    ...primary,
    name: primary.name === primary.slug && secondary.name !== secondary.slug
      ? secondary.name
      : primary.name,
    status: primary.status === 'connected' || secondary.status === 'connected'
      ? 'connected'
      : primary.status,
    baseUrl: primary.baseUrl || secondary.baseUrl,
    apiKey: primary.apiKey || secondary.apiKey,
    configuredIn: primary.apiKey || primary.baseUrl ? primary.configuredIn : secondary.configuredIn,
    models,
  };
}

function deduplicateProviderItems(items: ProviderItem[]): ProviderItem[] {
  const bySlug = new Map<string, ProviderItem>();
  for (const item of items) {
    const key = providerIdentityKey(item);
    const existing = bySlug.get(key);
    bySlug.set(key, existing ? mergeProviderItems(existing, item) : item);
  }
  return [...bySlug.values()];
}

/** Merge all three omp provider sources with app-local custom SQLite entries. */
async function mergeProviders(custom: ProviderItem[]): Promise<{ providers: ProviderItem[]; modelsConfigPath: string }> {
  const disabled = (() => {
    try { return readDisabledProviders(); } catch { return new Set<string>(); }
  })();
  const authItems = await loadRpcProviderItems();
  const native = readNativeProviders();
  const nativeItems = native.map((info) => nativeProviderItem(
    info.slug,
    info.baseUrl,
    info.modelIds,
    disabled.has(info.slug) ? 'disconnected' : 'connected',
  ));
  const disabledItems = [...disabled]
    .filter((slug) => !nativeItems.some((n) => n.slug === slug) && !authItems.some((a) => a.slug === slug))
    .map(disabledProviderItem);
  const registryItems = deduplicateProviderItems([...authItems, ...nativeItems, ...disabledItems]);
  const nativeSlugs = new Set(registryItems.map((provider) => provider.slug.toLowerCase()));
  return {
    providers: deduplicateProviderItems([
      ...registryItems,
      ...custom.filter((p) => !nativeSlugs.has(p.slug.toLowerCase())),
    ]),
    modelsConfigPath: getModelsConfigPath(),
  };
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
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
      let list: ProviderItem[] = DEFAULT_PROVIDERS_LIST;
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(p => p.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, providers: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();

      // Re-enable a provider the omp agent disabled (config.yml disabledProviders).
      if (typeof body.enableProvider === 'string') {
        const changed = enableNativeProvider(body.enableProvider);
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let custom: ProviderItem[] = [];
        if (row?.value) {
          try { custom = JSON.parse(row.value); } catch {}
        }
        return json({ success: changed, providers: (await mergeProviders(custom)).providers });
      }

      let updatedProviders: ProviderItem[] = [];

      if (Array.isArray(body)) {
        updatedProviders = body;
      } else if (Array.isArray(body.providers)) {
        updatedProviders = body.providers;
      } else if (body.provider) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: ProviderItem[] = DEFAULT_PROVIDERS_LIST;
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(p => p.id === body.provider.id);
        if (idx >= 0) {
          list[idx] = body.provider;
        } else {
          list.push(body.provider);
        }
        updatedProviders = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedProviders),
      ]);

      return json({ success: true, providers: updatedProviders });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
