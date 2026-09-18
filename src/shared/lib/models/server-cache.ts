/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Process-wide registry caches shared by `GET /api/models` and the provider
 * settings routes. Both snapshot the omp registry for 60s, so every provider
 * mutation — connect, disconnect, model visibility, models.yml registration —
 * must drop them together. Otherwise the chat model picker keeps serving the
 * list from before the change until the TTL expires.
 */

import type { ModelsData, ProviderItem } from '@/shared/types';

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberModelsCache: { data: ModelsData; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __ompChamberProvidersRpcCache: { data: ProviderItem[]; expiresAt: number } | undefined;
}

/** Drops every cached model + provider registry snapshot. */
export function invalidateModelsCaches(): void {
  globalThis.__ompChamberModelsCache = undefined;
  globalThis.__ompChamberProvidersRpcCache = undefined;
}
