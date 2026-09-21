import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AIModelOption, ModelEntry } from '@/shared/types';
import { fetchModelsData, subscribeModelsUpdated } from '@/shared/lib/models/client';

function toOption(m: ModelEntry): AIModelOption {
  const ladder = Array.isArray(m.thinkingLevels) ? m.thinkingLevels : [];
  const cost = m.cost;
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    contextWindow: m.contextWindow,
    thinkingLevel: ladder[0] ?? 'off',
    thinkingLevels: ladder,
    capabilities: ladder.length > 1 ? ['Tool calling', 'Reasoning'] : ['Tool calling'],
    cost: cost ? {
      input: cost.input !== undefined ? `$${cost.input}` : '—',
      output: cost.output !== undefined ? `$${cost.output}` : '—',
      cacheRead: cost.cacheRead !== undefined ? `$${cost.cacheRead}` : undefined,
      cacheWrite: cost.cacheWrite !== undefined ? `$${cost.cacheWrite}` : undefined,
    } : undefined,
  };
}

export interface ModelCatalogState {
  models: AIModelOption[];
  isLoading: boolean;
  setModels: (updater: (prev: AIModelOption[]) => AIModelOption[]) => void;
  selectedModel: AIModelOption | null;
  setSelectedModel: (model: AIModelOption | null) => void;
}

/**
 * Owns the `/api/models` subscription for the model picker.
 *
 * The list starts EMPTY and is only ever filled from the API: seeding a demo
 * catalog made the picker show fabricated providers until the real registry
 * resolved. `isLoading` marks the window in which the panel renders its
 * skeleton, and is cleared in a `finally` so a failed fetch still swaps the
 * skeleton for the empty-state message.
 *
 * An externally-driven selection (the composer's session model) always wins over
 * the API's own default — it is read through a ref so a thinking-level change
 * flowing back through the prop does not re-arm the fetch.
 */
export function useModelCatalog(externalSelectedModel?: AIModelOption): ModelCatalogState {
  const [models, setModelsState] = useState<AIModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<AIModelOption | null>(externalSelectedModel ?? null);

  const externalSelectedRef = useRef(externalSelectedModel);
  externalSelectedRef.current = externalSelectedModel;

  // Functional form only — callers patch rows in place and never replace the list.
  const setModels = useCallback((updater: (prev: AIModelOption[]) => AIModelOption[]) => {
    setModelsState(updater);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchModelsData();
      if (Array.isArray(data.modelList) && data.modelList.length > 0) {
        const realModels = data.modelList.map(toOption);
        // Keep a thinking level the user already picked, but only when it is
        // still a real level of this model's ladder (legacy mock values like
        // 'Default'/'High' must not be preserved).
        setModelsState(prev => realModels.map(rm => {
          const existing = prev.find(p => p.id === rm.id && p.provider === rm.provider);
          return existing?.thinkingLevel && rm.thinkingLevels?.includes(existing.thinkingLevel)
            ? { ...rm, thinkingLevel: existing.thinkingLevel }
            : rm;
        }));
        const defaultModel = data.defaultModel;
        if (defaultModel && !externalSelectedRef.current) {
          const match = realModels.find(m => m.id === defaultModel.modelId && m.provider === defaultModel.provider);
          if (match) setSelectedModel(match);
        }
      } else if (Array.isArray(data.models) && data.models.length > 0) {
        setModelsState(data.models);
      }
      if (data.selectedModel && !externalSelectedRef.current) {
        setSelectedModel(data.selectedModel);
      }
    } catch {
      // A failed load leaves the list empty — the pill shows a placeholder
      // rather than inventing a model the user cannot actually use.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeModelsUpdated(load);
  }, [load]);

  useEffect(() => {
    if (!externalSelectedModel) return;
    setSelectedModel(externalSelectedModel);
    // The pill in each row reads `models[i].thinkingLevel`, so a thinking
    // change made in the composer (which flows back via this prop) must also
    // update the matching list entry — not just the selectedModel state.
    setModelsState(prev => prev.map(m =>
      m.id === externalSelectedModel.id && m.provider === externalSelectedModel.provider
        ? { ...m, thinkingLevel: externalSelectedModel.thinkingLevel }
        : m
    ));
  }, [externalSelectedModel]);

  return { models, isLoading, setModels, selectedModel, setSelectedModel };
}
