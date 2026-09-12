/**
 * Server-side access to the models.dev catalog (https://models.dev/api.json):
 * a mapping of provider slug → model id → { name, attachment, reasoning,
 * tool_call, limit.context/output, cost.input/output }. Used as the metadata
 * fallback for provider models whose listing endpoint (/v1/models) only
 * returns bare ids. Cached in-process for 1 hour with graceful degradation —
 * catalog failures never fail the caller.
 */

const CATALOG_URL = 'https://models.dev/api.json';
const CATALOG_TTL_MS = 60 * 60 * 1000;

export interface CatalogModelInfo {
  name?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number; cache_read?: number };
}

type ModelsDevCatalog = Record<string, { models?: Record<string, CatalogModelInfo> }>;

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberModelsDevCatalog: { data: ModelsDevCatalog; expiresAt: number } | undefined;
}

export async function loadModelsDevCatalog(): Promise<ModelsDevCatalog> {
  const cached = globalThis.__ompChamberModelsDevCatalog;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return cached?.data ?? {};
    const data = await response.json() as ModelsDevCatalog;
    if (!data || typeof data !== 'object') return cached?.data ?? {};
    globalThis.__ompChamberModelsDevCatalog = { data, expiresAt: Date.now() + CATALOG_TTL_MS };
    return data;
  } catch {
    return cached?.data ?? {};
  }
}

/**
 * Look up a model in the catalog trying the plain id and, for
 * "vendor/id" composite ids (OpenRouter-style), the vendor prefix and the
 * bare id after the slash.
 */
export function findCatalogModel(
  catalog: ModelsDevCatalog,
  providerSlug: string | undefined,
  modelId: string,
): { info: CatalogModelInfo; providerKey: string } | null {
  const providerCandidates = new Set<string>();
  if (providerSlug) providerCandidates.add(providerSlug);
  const idCandidates = new Set<string>([modelId]);
  if (modelId.includes('/')) {
    providerCandidates.add(modelId.split('/')[0]);
    const bareId = modelId.split('/').pop();
    if (bareId) idCandidates.add(bareId);
  }
  for (const providerKey of providerCandidates) {
    for (const id of idCandidates) {
      const info = catalog[providerKey]?.models?.[id];
      if (info) return { info, providerKey };
    }
  }
  return null;
}
