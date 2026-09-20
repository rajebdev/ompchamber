import { useEffect, useRef, useState } from 'preact/hooks';
import type { ModelsResponse } from '@/shared/lib/models/client';
import { fetchModelsData, subscribeModelsUpdated } from '@/shared/lib/models/client';

/**
 * Live projection of the shared `/api/models` catalog: fetches once, then
 * re-projects on every `omp:models-updated` broadcast, so a picker's display
 * names stay in step with the composer without each consumer re-implementing
 * the fetch/subscribe/`active` dance.
 *
 * `selector` maps the raw catalog to the value a consumer needs (model names,
 * provider names, ...). Returning `undefined` leaves the previous value in
 * place — callers use that to ignore a payload that carries no data (e.g. an
 * empty model list) rather than clearing a good map. The selector is read
 * through a ref so an inline arrow does not re-arm the subscription.
 */
export function useModelsCatalog<T>(selector: (data: ModelsResponse) => T | undefined): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    let active = true;

    const sync = async () => {
      try {
        const data = await fetchModelsData();
        if (!active) return;
        const next = selectorRef.current(data);
        if (next !== undefined) setValue(next);
      } catch {
        // A failed refresh keeps the last good value.
      }
    };

    void sync();
    const unsubscribe = subscribeModelsUpdated(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return value;
}
