import type { ModelsResponse } from '@/shared/lib/models/client';
import { providerNamesFromConnected } from '@/shared/lib/models/provider-label';
import { useModelsCatalog } from '@/client/hooks/models/use-models-catalog';

/** slug → display-name map from `connectedProviders` ({} when none connected). */
export function selectProviderNames(data: ModelsResponse): Record<string, string> {
  return providerNamesFromConnected(data.connectedProviders);
}

/**
 * Live provider-slug → display-name map from the shared /api/models catalog
 * (`connectedProviders`), so UI can show "Kenari" instead of the raw `kenari`
 * slug. Pairs with `providerLabel()` for lookups. Returns an empty map while
 * loading, in MOCK mode, or when the catalog has no `connectedProviders`.
 */
export function useProviderNames(): Record<string, string> {
  return useModelsCatalog(selectProviderNames) ?? {};
}
