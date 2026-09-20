import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { loadModelsDevCatalog } from '@/shared/lib/models/catalog';

/**
 * Model pricing catalog from https://models.dev/api.json (shared 1h in-memory
 * cache), the same source ompweb uses. Cost values are per million tokens.
 * Query `?provider=<id>` to filter, or `?id=<provider>/<model>` for one entry.
 *
 * Pricing keeps a longer 20s fetch timeout than the default catalog loader and
 * surfaces failures through its own error envelope, so it opts into both.
 */
const PRICING_TIMEOUT_MS = 20_000;

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
    const catalog = await loadModelsDevCatalog({
      timeoutMs: PRICING_TIMEOUT_MS,
      strict: true,
    });
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
