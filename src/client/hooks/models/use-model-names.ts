import type { ModelsResponse } from '@/shared/lib/models/client';
import { useModelsCatalog } from '@/client/hooks/models/use-models-catalog';

/** id → display-name map from the catalog's `modelList`; undefined on an empty list. */
export function selectModelNames(data: ModelsResponse): Record<string, string> | undefined {
  if (!data.modelList?.length) return undefined;
  return Object.fromEntries(data.modelList.map((m): [string, string] => [m.id, m.name || m.id]));
}

/**
 * Live id → display-name map from the shared /api/models catalog (same source
 * as the composer), so footers can show "DeepSeek V4 Flash" instead of
 * "deepseek-v4-flash". Falls back to the raw id for unknown models.
 */
export function useModelNames(): Record<string, string> {
  return useModelsCatalog(selectModelNames) ?? {};
}
