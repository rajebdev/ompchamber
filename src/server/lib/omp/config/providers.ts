/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native OMP provider access — models.yml discovery + config.yml
 * disabledProviders writes. Faithful adaptation of omp-web/lib/omp/models-config.ts
 * and omp-web/app/api/providers/enable/route.ts.
 */

import { join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';
import { writeFileAtomic } from '@/server/lib/fs/atomic-write';
import { asMapping } from '@/server/lib/omp/config/yaml';
import { isRecord } from '@/shared/lib/util/guards';

/** Path of the native OMP models config (~/.omp/agent/models.yml). */
export async function getModelsConfigPath(): Promise<string> {
  const yml = join(getAgentDir(), 'models.yml');
  return (await Bun.file(yml).exists()) ? yml : join(getAgentDir(), 'models.yaml');
}

export interface NativeProviderInfo {
  /** Provider slug, e.g. "deepseek" or "custom/my-gateway". */
  slug: string;
  /** Base URL of the provider API, when configured. */
  baseUrl?: string;
  /** Model ids registered under this provider in models.yml. */
  modelIds: string[];
  models: NativeModelInfo[];
}

export interface NativeModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
}

/**
 * Read custom providers/models registered in models.yml. Returns [] when the
 * file is missing or has no providers — never throws for absent files.
 */
export async function readNativeProviders(): Promise<NativeProviderInfo[]> {
  const path = await getModelsConfigPath();
  if (!(await Bun.file(path).exists())) return [];
  try {
    const data = Bun.YAML.parse(await Bun.file(path).text());
    if (!isRecord(data)) return [];
    const providers = data.providers;
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return [];
    return Object.entries(providers as Record<string, unknown>).map(([slug, value]) => {
      const info: NativeProviderInfo = { slug, modelIds: [], models: [] };
      if (isRecord(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.baseUrl === 'string') info.baseUrl = record.baseUrl;
        if (isRecord(record.models)) {
          info.models = Object.entries(record.models as Record<string, unknown>).flatMap(([id, model]) => {
            if (typeof model !== 'object' || model === null || Array.isArray(model)) return [{ id }];
            const value = model as Record<string, unknown>;
            return [{
              id,
              ...(typeof value.name === 'string' ? { name: value.name } : {}),
              ...(typeof value.contextWindow === 'number' ? { contextWindow: value.contextWindow } : {}),
              ...(typeof value.maxTokens === 'number' ? { maxTokens: value.maxTokens } : {}),
              ...(value.reasoning === true ? { reasoning: true } : {}),
              ...(Array.isArray(value.input) && value.input.includes('image') ? { imageInput: true } : {}),
            }];
          });
        } else if (Array.isArray(record.models)) {
          info.models = record.models.flatMap((model) => {
            if (typeof model === 'string') return [{ id: model }];
            if (typeof model !== 'object' || model === null || Array.isArray(model)) return [];
            const value = model as Record<string, unknown>;
            if (typeof value.id !== 'string') return [];
            return [{
              id: value.id,
              ...(typeof value.name === 'string' ? { name: value.name } : {}),
              ...(typeof value.contextWindow === 'number' ? { contextWindow: value.contextWindow } : {}),
              ...(typeof value.maxTokens === 'number' ? { maxTokens: value.maxTokens } : {}),
              ...(value.reasoning === true ? { reasoning: true } : {}),
              ...(Array.isArray(value.input) && value.input.includes('image') ? { imageInput: true } : {}),
            }];
          });
        }
        info.modelIds = info.models.map((model) => model.id);
      }
      return info;
    });
  } catch {
    return [];
  }
}

/** One model entry destined for models.yml (cost numbers are USD per 1M tokens). */
export interface OmpProviderModelSeed {
  id: string;
  name?: string;
  reasoning?: boolean;
  imageInput?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface OmpProviderUpsertInput {
  baseUrl: string;
  apiKey?: string;
  api?: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';
  models: OmpProviderModelSeed[];
}

export interface OmpProviderUpsertResult {
  written: boolean;
  addedModels: string[];
  /** Existing bare entries whose missing metadata got filled from this fetch. */
  backfilledModels: string[];
  skippedModels: string[];
  reason?: string;
}

/**
 * Add-only upsert of a provider (and its models) into the native omp
 * models.yml — the agent's own registry, where per-model cost feeds usage
 * tracking. Existing provider fields (apiKey, baseUrl) and existing model
 * entries are never modified; only models whose id is not yet registered are
 * appended. Merges use an atomic temp-file write preserving unrelated keys
 * (full-document Bun.YAML round-trip). Provider creation requires an
 * apiKey — omp rejects models-cfg providers without one unless auth is "none"
 * or "oauth"; existing providers keep whatever credential they already have.
 */
export async function upsertOmpProviderModels(
  slug: string,
  input: OmpProviderUpsertInput,
): Promise<OmpProviderUpsertResult> {
  const path = await getModelsConfigPath();
  const doc: Record<string, unknown> = (await Bun.file(path).exists())
    ? asMapping(Bun.YAML.parse(await Bun.file(path).text()), path)
    : {};
  let providers: Record<string, unknown> | undefined = isRecord(doc.providers) ? doc.providers : undefined;
  if (!providers) {
    providers = {};
    doc.providers = providers;
  }

  const existingPojo = isRecord(providers[slug]) ? (providers[slug] as Record<string, unknown>) : undefined;
  const existingModels = Array.isArray(existingPojo?.models) ? existingPojo.models : [];
  const knownIds = new Set<string>(
    existingModels.map((m) => (isRecord(m) && typeof m.id === 'string' ? m.id : '')).filter(Boolean),
  );

  const incomingById = new Map(input.models.map((m) => [m.id, m]));
  const additions = input.models.filter((m) => m.id && !knownIds.has(m.id));
  // Existing entries with bare ids (no context, no capabilities) get the
  // fetched metadata filled in — values already present are never touched.
  const backfillIds: string[] = existingPojo
    ? existingModels
      .filter((m) => {
        const entry = isRecord(m) ? m : {};
        const seed = incomingById.get(String(entry.id));
        if (!seed) return false;
        const missingContext = typeof entry.contextWindow !== 'number' || !entry.contextWindow;
        const missingCost = !entry.cost;
        return Boolean(
          (missingContext && (seed.contextWindow || seed.maxTokens))
          || (missingCost && seed.cost)
          || (seed.reasoning !== undefined && entry.reasoning === undefined)
          || (typeof entry.input !== 'object' && seed.imageInput),
        );
      })
      .map((m) => String((isRecord(m) ? m : {}).id ?? ''))
      .filter(Boolean)
    : [];
  if (additions.length === 0 && backfillIds.length === 0) {
    return {
      written: false,
      addedModels: [],
      backfilledModels: [],
      skippedModels: input.models.map((m) => m.id),
      reason: existingPojo ? 'all models already registered' : undefined,
    };
  }

  let targetApiValue: string | undefined;

  if (!existingPojo && !input.apiKey) {
    return {
      written: false,
      addedModels: [],
      backfilledModels: [],
      skippedModels: input.models.map((m) => m.id),
      reason: 'provider not yet in models.yml and no api key available to register it',
    };
  }

  if (!existingPojo) {
    providers[slug] = {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      // omp disables every custom provider when a models-carrying provider
      // lacks "api" (provider or model level) — always set one.
      api: input.api ?? 'openai-completions',
      models: [] as unknown[],
    };
  } else if (!existingPojo.api) {
    // Existing provider without an api: adding models without one would make
    // the whole models.yml fail omp validation, so fill it.
    targetApiValue = input.api ?? 'openai-completions';
  }

  const target = providers[slug] as Record<string, unknown>;
  if (targetApiValue) target.api = targetApiValue;
  if (!Array.isArray(target.models)) target.models = [];
  const targetModels = target.models as Record<string, unknown>[];
  for (const model of additions) {
    targetModels.push({
      id: model.id,
      ...(model.name ? { name: model.name } : {}),
      ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
      ...(model.imageInput ? { input: ['text', 'image'] } : { input: ['text'] }),
      ...(model.contextWindow && model.contextWindow > 0 ? { contextWindow: model.contextWindow } : {}),
      ...(model.maxTokens && model.maxTokens > 0 ? { maxTokens: model.maxTokens } : {}),
      ...(model.cost ? {
        cost: {
          input: model.cost.input,
          output: model.cost.output,
          cacheRead: model.cost.cacheRead,
          cacheWrite: model.cost.cacheWrite,
        },
      } : {}),
    });
  }

  for (const entry of targetModels) {
    const entryId = typeof entry?.id === 'string' ? entry.id : '';
    if (!entryId || !backfillIds.includes(entryId)) continue;
    const seed = incomingById.get(entryId);
    if (!seed) continue;
    if (seed.name && !entry.name) entry.name = seed.name;
    if (seed.reasoning !== undefined && entry.reasoning === undefined) {
      entry.reasoning = seed.reasoning;
    }
    const currentInput = entry.input;
    if (seed.imageInput && !Array.isArray(currentInput)) {
      entry.input = ['text', 'image'];
    } else if (seed.imageInput && Array.isArray(currentInput) && !(currentInput as unknown[]).includes('image')) {
      entry.input = ['text', 'image'];
    }
    if (seed.contextWindow && seed.contextWindow > 0 && !entry.contextWindow) {
      entry.contextWindow = seed.contextWindow;
    }
    if (seed.maxTokens && seed.maxTokens > 0 && !entry.maxTokens) {
      entry.maxTokens = seed.maxTokens;
    }
    if (seed.cost && !entry.cost) {
      entry.cost = {
        input: seed.cost.input,
        output: seed.cost.output,
        cacheRead: seed.cost.cacheRead,
        cacheWrite: seed.cost.cacheWrite,
      };
    }
  }

  await writeFileAtomic(path, Bun.YAML.stringify(doc, null, 2));

  return {
    written: true,
    addedModels: additions.map((m) => m.id),
    backfilledModels: backfillIds,
    skippedModels: input.models.filter((m) => knownIds.has(m.id)).map((m) => m.id),
  };
}
