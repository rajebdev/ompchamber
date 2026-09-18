import { useEffect, useState } from 'preact/hooks';
import { fetchModelsData, subscribeModelsUpdated } from '@/shared/lib/models/client';
import { providerNamesFromConnected } from '@/shared/lib/models/provider-label';

/**
 * Live provider-slug → display-name map from the shared /api/models catalog
 * (`connectedProviders`), so UI can show "Kenari" instead of the raw `kenari`
 * slug. Pairs with `providerLabel()` for lookups. Returns an empty map while
 * loading, in MOCK mode, or when the catalog has no `connectedProviders`.
 */
export function useProviderNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const syncNames = async () => {
      try {
        const data = await fetchModelsData();
        if (!active) return;
        setNames(providerNamesFromConnected(data.connectedProviders));
      } catch {
        if (active) setNames({});
      }
    };

    syncNames();
    const unsubscribe = subscribeModelsUpdated(syncNames);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return names;
}
