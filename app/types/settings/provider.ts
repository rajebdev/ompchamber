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
  configuredIn: string; // e.g. "auth credentials", "api key", "environment"
  apiKey?: string;
  baseUrl?: string;
  models: ProviderModel[];
}
