import { useEffect, useState } from 'preact/hooks';
import { fetchModelsData, subscribeModelsUpdated } from '@/shared/lib/models/client';

/**
 * Live id → display-name map from the shared /api/models catalog (same source
 * as the composer), so footers can show "DeepSeek V4 Flash" instead of
 * "deepseek-v4-flash". Falls back to the raw id for unknown models.
 */
export function useModelNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const syncNames = async () => {
      try {
        const data = await fetchModelsData();
        if (!active || !data.modelList?.length) return;
        setNames(Object.fromEntries(data.modelList.map((m): [string, string] => [m.id, m.name || m.id])));
      } catch {}
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
