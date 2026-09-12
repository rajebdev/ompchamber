/**
 * Auto-fetch helpers for the providers settings: remote model listing via
 * POST /api/settings/provider-models, and the add-only merge — existing
 * models are never removed or modified, only unknown ids get appended.
 */

import type { ProviderModel } from '@/types';

export interface ProviderModelsFetchResult {
  ok: boolean;
  models?: ProviderModel[];
  error?: string;
  omp?: { written: boolean; addedCount: number; backfilledCount: number; reason?: string };
}

export async function fetchProviderModelsRemote(
  baseUrl: string,
  apiKey?: string,
  providerSlug?: string,
  persistToOmp = false,
): Promise<ProviderModelsFetchResult> {
  try {
    const response = await fetch('/api/settings/provider-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey, providerSlug, persistToOmp }),
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
              isFavorite: true,
              capabilities: ['Tool calling', 'Reasoning'],
              inputFormats: ['text'],
              outputFormats: ['text'],
            },
          }),
        }),
      ),
    );
    window.dispatchEvent(new CustomEvent('omp:models-updated'));
  } catch (error) {
    console.error('Failed to sync provider models to catalog:', error);
  }
}
