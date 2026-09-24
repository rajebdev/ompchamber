export interface ProviderModel {
  id: string;
  name: string;
  contextWindow: string; // e.g. "1M ctx · 384K out"
  hasTools: boolean;
  hasVision: boolean;
  hasReasoning?: boolean;
  isVisible: boolean;
  /** USD per 1M tokens (unit of measure not obvious from the name alone). */
  priceInput?: number;
  priceOutput?: number;
  /** Cache read/write rates, from the models.dev catalog only. */
  priceCacheRead?: number;
  priceCacheWrite?: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface ProviderItem {
  id: string;
  name: string;
  slug: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'connecting';
  /**
   * Present in omp's own config.yml `disabledProviders`. A disabled provider is
   * excluded from the chat model picker entirely — independent of `status`, which
   * only says whether credentials resolve.
   */
  disabled?: boolean;
  configuredIn: string; // e.g. "auth credentials", "api key", "environment"
  apiKey?: string;
  baseUrl?: string;
  models: ProviderModel[];
}

export interface PresetProviderOption {
  id: string;
  name: string;
  slug: string;
  icon: string;
  defaultUrl: string;
}
