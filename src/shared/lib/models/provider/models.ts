/**
 * Auto-fetch helpers for the providers settings: remote model listing via
 * POST /api/settings/provider-models, and the add-only merge — existing
 * models are never removed or modified, only unknown ids get appended.
 */

import type { ProviderModel } from '@/shared/types';
import type {
  OmpProviderApi,
  ProviderAuthMode,
  ProviderDiscoveryType,
} from '@/shared/types/settings/provider';
import type { ProviderThinkingEffort } from '@/shared/lib/models/provider/dialect';
import { notifyModelsUpdated } from '@/shared/lib/models/client';

export interface ProviderModelsFetchResult {
  ok: boolean;
  models?: ProviderModel[];
  error?: string;
  omp?: {
    written: boolean;
    addedCount: number;
    backfilledCount: number;
    reason?: string;
  };
}

export interface ProviderModelsFetchRequest {
  baseUrl: string;
  apiKey?: string;
  providerSlug?: string;
  persistToOmp?: boolean;
  /** Wire dialect to probe and to write into models.yml. */
  api?: OmpProviderApi;
  /** omp auth mode; `none` marks a keyless local server. */
  auth?: ProviderAuthMode;
  /** Register the provider for omp's own live discovery — no listing here. */
  discovery?: ProviderDiscoveryType;
  /** Register the provider WITHOUT listing models (endpoint override only). */
  registerOnly?: boolean;
}

export async function fetchProviderModelsRemote(
  request: ProviderModelsFetchRequest,
): Promise<ProviderModelsFetchResult> {
  try {
    const response = await fetch('/api/settings/provider-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await response.json() as ProviderModelsFetchResult;
    if (!response.ok) {
      return { ok: false, error: data?.error || `Request failed (HTTP ${response.status})` };
    }
    return data;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error while fetching models',
    };
  }
}

export interface ProviderModelsMergeResult {
  merged: ProviderModel[];
  added: ProviderModel[];
  addedCount: number;
}

/** One model registered by hand — the Add Model dialog's payload. */
export interface ManualModelRequest {
  provider: string;
  id: string;
  name?: string;
  /** Token counts, not the compact labels a listing produces. */
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
  /** USD per 1M tokens; both input and output are needed for a cost to be written. */
  costInput?: number;
  costOutput?: number;
  costCacheRead?: number;
  costCacheWrite?: number;
  /** Reasoning ladder this model accepts; omitted means "leave omp's default". */
  efforts?: ProviderThinkingEffort[];
  /** Only used when the provider has no models.yml entry yet. */
  baseUrl?: string;
  apiKey?: string;
  auth?: ProviderAuthMode;
}

export interface ManualModelResult {
  success: boolean;
  written: boolean;
  addedModels?: string[];
  backfilledModels?: string[];
  /** The provider already registers this id; nothing was overwritten. */
  alreadyKnown?: boolean;
  reason?: string;
  error?: string;
}

/**
 * Register one model in models.yml by hand. Unlike the auto-fetch this does not
 * need a listing endpoint — the id and its metadata come from the user — so it
 * is the path for a gateway model its `/models` route omits, an Azure
 * deployment name, or any provider omp cannot enumerate.
 */
export async function addProviderModel(request: ManualModelRequest): Promise<ManualModelResult> {
  try {
    const response = await fetch('/api/settings/provider-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await response.json() as ManualModelResult;
    if (!response.ok) {
      return { ...data, success: false, written: false, error: data?.error || data?.reason };
    }
    notifyModelsUpdated();
    return data;
  } catch (error) {
    return {
      success: false,
      written: false,
      error: error instanceof Error ? error.message : 'Network error while adding the model',
    };
  }
}

/**
 * Existing entries pass through untouched (visibility/config survive); the
 * chat model catalog is synced from the newly added entries only.
 */
export function mergeProviderModels(
  existing: ProviderModel[],
  incoming: ProviderModel[],
): ProviderModelsMergeResult {
  const known = new Set(existing.map((model) => model.id));
  const added: ProviderModel[] = [];
  for (const model of incoming) {
    if (!model.id || known.has(model.id)) continue;
    known.add(model.id);
    added.push({ ...model });
  }
  return { merged: [...existing, ...added], added, addedCount: added.length };
}

/**
 * Register newly added provider models on the chamber's catalog.
 *
 * `isFavorite` is deliberately NOT sent: the picker derives favorites from the
 * stored preference keys, so a catalog flag would be a second, silently
 * ignored source of truth for the FAVORITES rail. A new provider's models are
 * starred by the user, not by this sync.
 */
export async function syncProviderModelsToCatalog(
  providerName: string,
  models: ProviderModel[],
): Promise<void> {
  try {
    await Promise.all(
      models.map((model) =>
        fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'addModel',
            model: {
              id: model.id,
              name: model.name,
              provider: providerName,
              contextWindow: model.contextWindow?.split(' ')[0] || '128K',
              thinkingLevel: 'Default',
              capabilities: ['Tool calling', 'Reasoning'],
              inputFormats: ['text'],
              outputFormats: ['text'],
            },
          }),
        }),
      ),
    );
    notifyModelsUpdated();
  } catch (error) {
    console.error('Failed to sync provider models to catalog:', error);
  }
}
