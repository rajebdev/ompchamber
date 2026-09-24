import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { findCatalogModel, loadModelsDevCatalog } from '@/shared/lib/models/catalog';
import { extractModels } from '@/shared/lib/models/remote-list';
import { upsertOmpProviderModels } from '@/server/lib/omp/config/providers';
import { invalidateModelsCaches } from '@/shared/lib/models/server-cache';
import type { ProviderModel } from '@/shared/types';

/**
 * POST /api/settings/provider-models — lists models from an OpenAI-compatible
 * provider endpoint for the providers settings auto-fetch. Body:
 * { baseUrl: string, apiKey?: string, providerSlug?: string,
 *   persistToOmp?: boolean } → { ok, models, omp? } | { ok: false, error }.
 * Tries Bearer auth, then Anthropic x-api-key, then Gemini ?key= — the first
 * style returning a recognizable list wins. Models missing metadata (context,
 * capabilities, price) are enriched from the models.dev catalog. With
 * persistToOmp the enriched models are also registered into the native omp
 * models.yml (add-only) so the agent's usage tracking knows their prices.
 */

const FETCH_TIMEOUT_MS = 15_000;
const ANTHROPIC_VERSION = '2023-06-01';
const MASKED_KEY_PATTERN = /•{3,}/;

const MOCK_REMOTE_MODELS: ProviderModel[] = [
  {
    id: 'mock-fetched-pro',
    name: 'Mock Ultra Pro (fetched)',
    contextWindow: '200K ctx · 64K out',
    hasTools: true,
    hasVision: true,
    hasReasoning: true,
    isVisible: true,
  },
  {
    id: 'mock-fetched-flash',
    name: 'Mock Flash (fetched)',
    contextWindow: '128K ctx · 16K out',
    hasTools: true,
    hasVision: false,
    isVisible: true,
  },
  {
    id: 'mock-fetched-mini',
    name: 'Mock Mini (fetched)',
    contextWindow: '64K ctx · 8K out',
    hasTools: true,
    hasVision: false,
    isVisible: true,
  },
];

interface FetchAttempt {
  models: ProviderModel[] | null;
  error: string;
}

async function attemptStyle(
  label: string,
  url: string,
  headers: Record<string, string>,
): Promise<FetchAttempt> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body (HTML error page, empty body) — payload stays null and is
    // reported below as an unrecognized response format.
  }
  if (response.status < 200 || response.status >= 300) {
    return { models: null, error: `${label}: HTTP ${response.status}` };
  }
  const models = extractModels(payload);
  if (!models) return { models: null, error: `${label}: unrecognized response format` };
  return { models, error: '' };
}

/**
 * Try the common listing styles in order: OpenAI-compatible Bearer auth,
 * Anthropic x-api-key, then Gemini ?key=. The first style that returns a
 * recognizable model list wins; otherwise the collected errors are reported.
 */
async function fetchRemoteModels(baseUrl: string, apiKey?: string): Promise<FetchAttempt> {
  const base = baseUrl.replace(/\/+$/, '');
  const attempts: Array<{ label: string; url: string; headers: Record<string, string> }> = [
    {
      label: 'OpenAI-compatible',
      url: `${base}/models`,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    },
  ];
  if (apiKey) {
    attempts.push({
      label: 'Anthropic',
      url: `${base}/models`,
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    });
    attempts.push({
      label: 'Gemini',
      url: `${base}/models?key=${encodeURIComponent(apiKey)}`,
      headers: {},
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await attemptStyle(attempt.label, attempt.url, attempt.headers);
      if (result.models) return result;
      errors.push(result.error);
    } catch (error) {
      // Network-level failure (DNS, refused, timeout) applies to every auth
      // style — no point retrying the same host with different headers.
      const message = error instanceof Error ? error.message : 'request failed';
      errors.push(`${attempt.label}: ${message}`);
      break;
    }
  }
  return {
    models: null,
    error: errors.length > 0 ? `Failed to fetch models — ${errors.join(' · ')}` : 'Failed to fetch models',
  };
}

/**
 * omp's `api` for a custom provider, inferred from its endpoint. omp accepts
 * eleven `api` values and there is no way to ask a gateway which one it speaks,
 * so the chamber only claims the two dialects it can recognise by URL; every
 * other endpoint gets the OpenAI-compatible default, which is what the
 * model-listing probe already assumes. A gateway that speaks something else
 * (Azure, Bedrock, Vertex, …) needs its `api` set by hand in models.yml.
 */
function inferProviderApi(baseUrl: string): 'openai-completions' | 'anthropic-messages' | 'google-generative-ai' {
  if (/anthropic\./i.test(baseUrl)) return 'anthropic-messages';
  if (/generativelanguage\.googleapis\.com/i.test(baseUrl)) return 'google-generative-ai';
  return 'openai-completions';
}

/**
 * omp's models.yml schema requires all four cost fields when cost is present,
 * so a price is only seeded when both sides are known; missing ones default
 * to 0. Context/output labels ("128K ctx · 16K out") parse back to tokens.
 * Cache prices come from the catalog and are kept when known — dropping them
 * makes every cached turn look free in omp's usage accounting.
 */
function toOmpSeed(model: ProviderModel): {
  id: string;
  name?: string;
  reasoning?: boolean;
  imageInput?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
} {
  const parseTokens = (label: string, suffix: string): number | undefined => {
    const match = label.match(new RegExp(`(\\d+(?:\\.\\d+)?)([KM])? ${suffix}`));
    if (!match) return undefined;
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    const multiplier = match[2] === 'M' ? 1_000_000 : 1000;
    return Math.round(value * multiplier);
  };
  const contextWindow = parseTokens(model.contextWindow, 'ctx');
  const outTokens = parseTokens(model.contextWindow, 'out');
  // omp rejects the whole file on a non-finite number, so a price has to be a
  // real finite value before it may be written at all.
  const price = (value: unknown): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  );
  const priceInput = price(model.priceInput);
  const priceOutput = price(model.priceOutput);
  const hasCost = priceInput !== undefined && priceOutput !== undefined;
  return {
    id: model.id,
    ...(model.name && model.name !== model.id ? { name: model.name } : {}),
    ...(model.hasReasoning ? { reasoning: true } : {}),
    ...(model.hasVision ? { imageInput: true } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(outTokens && outTokens > 0 ? { maxTokens: Math.round(outTokens) } : {}),
    ...(hasCost ? {
      cost: {
        input: priceInput,
        output: priceOutput,
        cacheRead: price(model.priceCacheRead) ?? 0,
        cacheWrite: price(model.priceCacheWrite) ?? 0,
      },
    } : {}),
  };
}

/**
 * Fill in metadata the listing endpoint did not provide from the models.dev
 * catalog: vision/reasoning/tool flags, context + output window, and
 * per-1M-token pricing (cache rates included). Only empty fields are filled —
 * anything the provider reported itself is kept.
 */
async function enrichFromCatalog(
  models: ProviderModel[],
  providerSlug: string | undefined,
): Promise<ProviderModel[]> {
  const catalog = await loadModelsDevCatalog();
  if (!catalog || Object.keys(catalog).length === 0) return models;
  return models.map((model) => {
    const match = findCatalogModel(catalog, providerSlug, model.id);
    if (!match) return model;
    const { info } = match;
    const ctx = info.limit?.context;
    const out = info.limit?.output;
    const ctxLabel = !model.contextWindow && ctx && ctx > 0
      ? Math.round(ctx / 1000)
      : null;
    const outLabel = out && out > 0 ? Math.round(out / 1000) : null;
    const catalogContext = ctxLabel
      ? (outLabel ? `${ctxLabel}K ctx · ${outLabel}K out` : `${ctxLabel}K ctx`)
      : '';
    return {
      ...model,
      name: model.name === model.id && info.name ? info.name : model.name,
      contextWindow: model.contextWindow || catalogContext,
      hasVision: model.hasVision || info.attachment === true,
      hasReasoning: model.hasReasoning ?? (info.reasoning === true || undefined),
      hasTools: model.hasTools || info.tool_call === true,
      priceInput: model.priceInput ?? (typeof info.cost?.input === 'number' ? info.cost.input : undefined),
      priceOutput: model.priceOutput ?? (typeof info.cost?.output === 'number' ? info.cost.output : undefined),
      priceCacheRead: model.priceCacheRead
        ?? (typeof info.cost?.cache_read === 'number' ? info.cost.cache_read : undefined),
      priceCacheWrite: model.priceCacheWrite
        ?? (typeof info.cost?.cache_write === 'number' ? info.cost.cache_write : undefined),
    };
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const body = await request.json() as {
      baseUrl?: unknown;
      apiKey?: unknown;
      providerSlug?: unknown;
      persistToOmp?: unknown;
    };
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const rawApiKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 0 ? body.apiKey.trim() : undefined;
    // The UI echoes stored masked keys back; a masked value is not a credential.
    const apiKey = rawApiKey && !MASKED_KEY_PATTERN.test(rawApiKey) ? rawApiKey : undefined;
    const providerSlug = typeof body.providerSlug === 'string' && body.providerSlug.trim().length > 0
      ? body.providerSlug.trim()
      : undefined;
    const persistToOmp = body.persistToOmp === true;
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return json({ ok: false, error: 'Base URL must be a valid http(s) endpoint' }, { status: 400 });
    }

    if (isMockMode()) {
      return json({ ok: true, models: MOCK_REMOTE_MODELS });
    }

    const result = await fetchRemoteModels(baseUrl, apiKey);
    if (!result.models) {
      return json({ ok: false, error: result.error }, { status: 502 });
    }
    const enriched = await enrichFromCatalog(result.models, providerSlug);

    let omp: { written: boolean; addedCount: number; backfilledCount: number; reason?: string } | undefined;
    if (persistToOmp && providerSlug && enriched.length > 0) {
      try {
        const upsert = await upsertOmpProviderModels(providerSlug, {
          baseUrl,
          apiKey,
          api: inferProviderApi(baseUrl),
          models: enriched.map(toOmpSeed),
        });
        if (upsert.written) invalidateModelsCaches();
        omp = {
          written: upsert.written,
          addedCount: upsert.addedModels.length,
          backfilledCount: upsert.backfilledModels.length,
          reason: upsert.reason,
        };
      } catch (error) {
        omp = {
          written: false,
          addedCount: 0,
          backfilledCount: 0,
          reason: error instanceof Error ? error.message : 'models.yml write failed',
        };
      }
    }

    return json({ ok: true, models: enriched, omp });
  } catch (error: unknown) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch models',
    }, { status: 500 });
  }
}
