/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model catalog types shared by the composer picker, the settings pages and
 * the `/api/models` route: the picker row (`AIModelOption`), the registry entry
 * (`ModelEntry`), the selection reference omp's `set_model` takes, and the
 * stored favorite/recent preference pair.
 *
 * Split out of `chat.ts` so that file stays under the per-file ceiling — the
 * picker's row shape is not part of the chat message model it was nested in.
 */

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
  providerIcon?: string;
  contextWindow?: string | number;
  isCmdAgent?: boolean;
  isFavorite?: boolean;
  isRecent?: boolean;
  thinkingLevel?: string;
  /** Baked thinking ladder for this model: `["off", ...efforts]`. */
  thinkingLevels?: string[];
  capabilities?: string[];
  input?: string;
  output?: string;
  cost?: {
    input: string | number;
    output: string | number;
    cacheRead?: string | number;
    cacheWrite?: string | number;
  };
  description?: string;
}

// ── Real omp model registry (forked from omp-web) ──────────────────────────

/** One pickable model from the omp catalog (`/api/models` modelList). */
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  supportsFastMode?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  /** Baked thinking ladder for this model: `["off", ...efforts]`. */
  thinkingLevels?: string[];
  /** Cost in $/1M tokens (omp catalog). */
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

/** A model selected by provider + modelId (omp's set_model shape). */
export interface SelectedModel {
  provider: string;
  modelId: string;
}

/** Model-level thinking metadata read off the live session state. */
export interface ThinkingModelMeta {
  provider: string;
  modelId: string;
  name?: string;
  reasoning?: boolean;
  thinking?: { efforts?: string[] };
}

/** Response shape of GET /api/models (mirrors omp-web ModelsData). */
export interface ModelsData {
  models: Record<string, string>;
  modelList: ModelEntry[];
  defaultModel: SelectedModel | null;
  thinkingLevels: Record<string, string[]>;
  connectedProviders?: { id: string; name: string; disabled: boolean }[];
  modelError?: string;
}
