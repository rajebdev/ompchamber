/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client writes for the provider settings. Two concerns share one endpoint: the
 * chamber-local overlay (per-model visibility + sampling config) and the
 * omp-native connect/disconnect flag. Both reshape the chat model picker, so
 * both notify it only AFTER the server confirmed the write — notifying first
 * would re-cache the pre-mutation list for another 60s.
 */

import type { ProviderItem } from '@/shared/types';
import { notifyModelsUpdated } from '@/shared/lib/models/client';

const PROVIDERS_ENDPOINT = '/api/settings/providers';

async function postProviders(body: unknown): Promise<ProviderItem[] | null> {
  const response = await fetch(PROVIDERS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { providers?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(data?.error || `Providers request failed (HTTP ${response.status})`);
  }
  notifyModelsUpdated();
  return Array.isArray(data.providers) ? (data.providers as ProviderItem[]) : null;
}

/** Stores the per-model overlay (visibility, sampling config) and refreshes the picker. */
export function saveProviderOverlay(providers: ProviderItem[]): Promise<ProviderItem[] | null> {
  return postProviders({ providers });
}

/** Flips a provider in omp's own config.yml disabledProviders list. */
export function setProviderEnabled(slug: string, enabled: boolean): Promise<ProviderItem[] | null> {
  return postProviders(enabled ? { enableProvider: slug } : { disableProvider: slug });
}
