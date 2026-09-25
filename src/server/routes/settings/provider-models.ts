import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { upsertOmpProviderModels } from '@/server/lib/omp/config/providers';
import { invalidateModelsCaches } from '@/shared/lib/models/server-cache';
import {
  enrichFromCatalog,
  fetchRemoteModels,
  toOmpSeed,
} from '@/server/lib/models/provider-listing.server';
import {
  inferProviderApi,
  isOmpProviderApi,
  isProviderAuthMode,
  isProviderDiscoveryType,
} from '@/shared/lib/models/provider/dialect';
import type { ProviderModel } from '@/shared/types';

/**
 * POST /api/settings/provider-models — lists models from a provider endpoint
 * for the providers settings auto-fetch, and optionally registers the provider
 * in omp's own models.yml. Body:
 * { baseUrl: string, apiKey?: string, providerSlug?: string, persistToOmp?: boolean,
 *   api?: OmpProviderApi, auth?: ProviderAuthMode, discovery?: ProviderDiscoveryType,
 *   registerOnly?: boolean } → { ok, models, omp? } | { ok: false, error }.
 *
 * `api` picks the dialect, which decides both the auth header the listing probe
 * sends and the `api` written to models.yml; when it is omitted the endpoint is
 * classified by URL and the probe tries the three common auth styles. Models
 * missing metadata (context, capabilities, price) are enriched from the
 * models.dev catalog. The probe itself lives in
 * `@/server/lib/models/provider-listing.server`.
 *
 * `discovery` and `registerOnly` skip the listing entirely: the first registers
 * a provider OMP will list itself, the second registers an endpoint override
 * for a provider omp already bundles. Both are legitimate with an empty model
 * list — writing ids there would freeze a snapshot omp would then serve
 * alongside its own listing.
 */

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
      api?: unknown;
      auth?: unknown;
      discovery?: unknown;
      registerOnly?: unknown;
    };
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const rawApiKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 0 ? body.apiKey.trim() : undefined;
    // The UI echoes stored masked keys back; a masked value is not a credential.
    const apiKey = rawApiKey && !MASKED_KEY_PATTERN.test(rawApiKey) ? rawApiKey : undefined;
    const providerSlug = typeof body.providerSlug === 'string' && body.providerSlug.trim().length > 0
      ? body.providerSlug.trim()
      : undefined;
    const persistToOmp = body.persistToOmp === true;
    const registerOnly = body.registerOnly === true;
    // An unrecognized dialect from the client is dropped rather than written:
    // omp disables EVERY custom provider in the file over one unknown `api`.
    const api = isOmpProviderApi(body.api) ? body.api : undefined;
    const auth = isProviderAuthMode(body.auth) ? body.auth : undefined;
    const discovery = isProviderDiscoveryType(body.discovery) ? body.discovery : undefined;
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return json({ ok: false, error: 'Base URL must be a valid http(s) endpoint' }, { status: 400 });
    }
    // A keyless or discovery-only provider has no listing to fetch, so a
    // register-only call is the whole operation — and it must not demand the
    // model list that the caller deliberately did not ask for.
    const skipListing = registerOnly || discovery !== undefined;

    if (isMockMode()) {
      return json({ ok: true, models: skipListing ? [] : MOCK_REMOTE_MODELS });
    }

    let enriched: ProviderModel[] = [];
    if (!skipListing) {
      const result = await fetchRemoteModels(baseUrl, apiKey, api);
      if (!result.models) {
        return json({ ok: false, error: result.error }, { status: 502 });
      }
      enriched = await enrichFromCatalog(result.models, providerSlug);
    }

    let omp: {
      written: boolean;
      addedCount: number;
      backfilledCount: number;
      reason?: string;
    } | undefined;
    if (persistToOmp && providerSlug) {
      try {
        const upsert = await upsertOmpProviderModels(providerSlug, {
          baseUrl,
          apiKey,
          api: api ?? inferProviderApi(baseUrl),
          ...(auth ? { auth } : {}),
          ...(discovery ? { discovery } : {}),
          // An override/discovery provider keeps omp's own model list; writing
          // ids here would freeze a snapshot omp would then serve twice.
          overrideOnly: skipListing,
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
