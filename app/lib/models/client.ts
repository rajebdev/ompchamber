/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared client for GET /api/models. Dedupes concurrent callers onto a single
 * in-flight request and caches the result for 60s (mirroring the server-side
 * cache TTL), so mounting ChatInput + ModelDropdown together costs one fetch.
 */

import type { AIModelOption, ModelsData } from '@/types';

const CACHE_TTL_MS = 60_000;

/** GET /api/models response: ModelsData (real mode) + mock-mode extras. */
export type ModelsResponse = ModelsData & { selectedModel?: AIModelOption };

let inFlight: Promise<ModelsResponse> | null = null;
let cached: { data: ModelsResponse; expiresAt: number } | null = null;

export function fetchModelsData(): Promise<ModelsResponse> {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  if (inFlight) return inFlight;

  inFlight = fetch('/api/models')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`GET /api/models failed: ${res.status}`))))
    .then((data: ModelsResponse) => {
      cached = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function invalidateModelsCache(): void {
  cached = null;
}

export function notifyModelsUpdated(): void {
  cached = null;
  window.dispatchEvent(new CustomEvent('omp:models-updated'));
}

export function subscribeModelsUpdated(handler: () => void): () => void {
  window.addEventListener('omp:models-updated', handler);
  return () => window.removeEventListener('omp:models-updated', handler);
}
