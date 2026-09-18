import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';

/**
 * Model pricing catalog from https://models.dev/api.json (1h in-memory cache),
 * the same source ompweb uses. Cost values are per million tokens. Query
 * `?provider=<id>` to filter, or `?id=<provider>/<model>` for one entry.
 */

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberPricingCache: { data: Record<string, unknown>; expiresAt: number } | undefined;
}
const CACHE_TTL_MS = 60 * 60 * 1000;

async function loadCatalog(): Promise<Record<string, unknown>> {
  const cached = globalThis.__ompChamberPricingCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const response = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`models.dev responded ${response.status}`);
  const data = await response.json() as unknown;
  if (typeof data !== 'object' || data === null) throw new Error('models.dev payload is not an object');
  const catalog = data as Record<string, unknown>;
  globalThis.__ompChamberPricingCache = { data: catalog, expiresAt: Date.now() + CACHE_TTL_MS };
  return catalog;
}

interface CatalogModel {
  id?: string;
  name?: string;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  limit?: { context?: number; output?: number };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  if (mock) {
    return json({ providers: {}, isMock: true });
  }
  try {
    const catalog = await loadCatalog();
    const url = new URL(request.url);
    const providerFilter = url.searchParams.get('provider');
    const modelId = url.searchParams.get('id');

    if (modelId) {
      const [providerSlug, ...rest] = modelId.split('/');
      const provider = catalog[providerSlug] as Record<string, unknown> | undefined;
      const models = (provider?.models ?? {}) as Record<string, CatalogModel>;
      const wanted = rest.join('/');
      const match = Object.entries(models).find(([key, model]) => key === wanted || model?.id === wanted);
      return json({ found: match ? { provider: providerSlug, modelKey: match[0], ...match[1] } : null, isMock: false });
    }

    const providers: Record<string, unknown> = {};
    for (const [slug, value] of Object.entries(catalog)) {
      if (providerFilter && slug !== providerFilter) continue;
      if (typeof value !== 'object' || value === null) continue;
      const record = value as Record<string, unknown>;
      const models = record.models as Record<string, CatalogModel> | undefined;
      if (!models || typeof models !== 'object') continue;
      providers[slug] = Object.fromEntries(
        Object.entries(models).map(([key, model]) => [key, {
          name: model?.name ?? key,
          cost: model?.cost ?? null,
          limit: model?.limit ?? null,
        }]),
      );
    }
    return json({ providers, isMock: false });
  } catch (error: any) {
    return json({ providers: {}, isMock: false, error: error.message }, { status: 200 });
  }
}
