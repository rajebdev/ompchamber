/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Write side of the native OMP provider registry — `models.yml`.
 *
 * omp never writes this file itself (its `ModelsConfigFile` is load-only), so
 * the chamber is the only automated author and every write is a
 * read-modify-write of a user-editable document: comments, formatting, and
 * unrelated keys all have to survive, and the result has to pass omp's own
 * schema before it reaches disk. Reading lives in `./models-config.ts`.
 */

import { isMap, isSeq, type Document, type YAMLMap } from 'yaml';
import { getModelsConfigPath } from '@/server/lib/omp/config/models-config';
import { plainOf, withOmpYamlDocument, OmpConfigError } from '@/server/lib/omp/config/document';
import { validateModelsDocument, sanitizeModelEntry } from '@/server/lib/omp/config/models-validation';
import { isRecord } from '@/shared/lib/util/guards';

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

/** Masks a stored credential echoed back by the UI; not a value to persist. */
const MASKED_KEY_PATTERN = /•{3,}/;

/** True when `value` is a credential the UI masked rather than a real key. */
export function isMaskedApiKey(value: unknown): boolean {
  return typeof value === 'string' && MASKED_KEY_PATTERN.test(value);
}

/** The model ids already registered under `provider`, array form only. */
function knownModelIds(provider: Record<string, unknown> | undefined): Set<string> {
  if (!Array.isArray(provider?.models)) return new Set();
  return new Set(
    provider.models
      .map((model) => (isRecord(model) && typeof model.id === 'string' ? model.id : ''))
      .filter(Boolean),
  );
}

/** The model entry as omp expects it, omitting anything omp would reject. */
function toModelEntry(model: OmpProviderModelSeed): Record<string, unknown> {
  return sanitizeModelEntry({
    id: model.id,
    ...(model.name ? { name: model.name } : {}),
    ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
    ...(model.imageInput ? { input: ['text', 'image'] } : { input: ['text'] }),
    ...(model.contextWindow && model.contextWindow > 0 ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxTokens && model.maxTokens > 0 ? { maxTokens: model.maxTokens } : {}),
    ...(model.cost ? { cost: model.cost } : {}),
  });
}

/**
 * Metadata a bare existing entry is missing, taken from the freshly fetched
 * seed. Values already present are never touched. Writes through the YAML node
 * so the entry's own comments and key order stay as the user wrote them.
 */
function backfillEntry(doc: Document, entry: YAMLMap, seed: OmpProviderModelSeed): void {
  if (seed.name && !entry.has('name')) entry.set('name', seed.name);
  if (seed.reasoning !== undefined && !entry.has('reasoning')) {
    entry.set('reasoning', seed.reasoning);
  }
  const currentInput = plainOf<string[]>(doc, entry.get('input'));
  if (seed.imageInput && (!Array.isArray(currentInput) || !currentInput.includes('image'))) {
    entry.set('input', ['text', 'image']);
  }
  if (seed.contextWindow && seed.contextWindow > 0 && !plainOf(doc, entry.get('contextWindow'))) {
    entry.set('contextWindow', seed.contextWindow);
  }
  if (seed.maxTokens && seed.maxTokens > 0 && !plainOf(doc, entry.get('maxTokens'))) {
    entry.set('maxTokens', seed.maxTokens);
  }
  if (seed.cost && !entry.has('cost')) {
    entry.set('cost', seed.cost);
  }
}

/**
 * Add-only upsert of a provider (and its models) into the native omp
 * models.yml — the agent's own registry, where per-model cost feeds usage
 * tracking. Existing provider fields (apiKey, baseUrl) and existing model
 * entries are never modified; only models whose id is not yet registered are
 * appended. Merges preserve unrelated keys, comments and formatting (document
 * model), and the write is atomic and mode-preserving.
 *
 * Provider creation requires an apiKey — omp rejects models-cfg providers
 * without one unless auth is "none" or "oauth"; existing providers keep
 * whatever credential they already have. The finished document is validated
 * against omp's own rules before the write: a schema violation anywhere in the
 * file makes omp disable every custom provider at once.
 */
export async function upsertOmpProviderModels(
  slug: string,
  input: OmpProviderUpsertInput,
): Promise<OmpProviderUpsertResult> {
  const path = await getModelsConfigPath();
  return withOmpYamlDocument<OmpProviderUpsertResult>(path, (doc) => {
    const original = doc.toJS() as Record<string, unknown> | null;
    const providersNode = doc.get('providers');
    if (providersNode !== undefined && !isMap(providersNode)) {
      throw new OmpConfigError(`${path} providers must be a mapping`);
    }
    // `doc.get`/`getIn` hand back YAML nodes, never plain values: an existing
    // provider has to be read through the node (`get`), or it reads as absent
    // and the "add-only" upsert overwrites the user's credentials.
    const providerNode = providersNode === undefined ? undefined : (providersNode as YAMLMap).get(slug);
    const existing = isMap(providerNode)
      ? (providerNode.toJS(doc) as Record<string, unknown>)
      : undefined;
    // omp requires `models` to be an ARRAY. A map-form entry makes omp reject
    // the entire file ("custom providers disabled"), so rewriting it as an
    // array would silently delete every model the user had registered there.
    // Refuse and say what is wrong instead — the file is theirs to fix.
    if (existing?.models !== undefined && !Array.isArray(existing.models)) {
      throw new OmpConfigError(
        `${path}: provider "${slug}" has a map-form "models" — omp requires an array. `
        + 'Fix that entry before adding models; omp currently disables every custom provider because of it.',
      );
    }
    const known = knownModelIds(existing);
    const incomingById = new Map(input.models.map((model) => [model.id, model]));
    const additions = input.models.filter((model) => model.id && !known.has(model.id));

    if (!existing && !input.apiKey) {
      return {
        result: {
          written: false,
          addedModels: [],
          backfilledModels: [],
          skippedModels: input.models.map((model) => model.id),
          reason: 'provider not yet in models.yml and no api key available to register it',
        },
        changed: false,
      };
    }
    // The UI echoes stored credentials back masked ("sk-••••…"), and this
    // writer is the last gate before a file omp will authenticate with — a
    // masked placeholder persisted here would look like a configured provider
    // that cannot authenticate.
    if (!existing && isMaskedApiKey(input.apiKey)) {
      return {
        result: {
          written: false,
          addedModels: [],
          backfilledModels: [],
          skippedModels: input.models.map((model) => model.id),
          reason: 'the supplied API key is a masked placeholder, not a credential',
        },
        changed: false,
      };
    }

    // Existing entries with bare ids (no context, no capabilities) get the
    // fetched metadata filled in — values already present are never touched.
    const backfillIds = (Array.isArray(existing?.models) ? existing.models : [])
      .filter((model): model is Record<string, unknown> => {
        if (!isRecord(model) || typeof model.id !== 'string') return false;
        const seed = incomingById.get(model.id);
        if (!seed) return false;
        const missingContext = typeof model.contextWindow !== 'number' || !model.contextWindow;
        return Boolean(
          (missingContext && (seed.contextWindow || seed.maxTokens))
          || (!model.cost && seed.cost)
          || (seed.reasoning !== undefined && model.reasoning === undefined)
          || (!Array.isArray(model.input) && seed.imageInput),
        );
      })
      .map((model) => String(model.id));

    if (additions.length === 0 && backfillIds.length === 0) {
      return {
        result: {
          written: false,
          addedModels: [],
          backfilledModels: [],
          skippedModels: input.models.map((model) => model.id),
          reason: existing ? 'all models already registered' : undefined,
        },
        changed: false,
      };
    }

    // `doc.createNode` (not a plain object) — a bare object stored via `setIn`
    // stays a JS object, so a later `getIn(...).add()` throws "Expected YAML
    // collection" instead of appending.
    if (!existing) {
      doc.setIn(['providers', slug], doc.createNode({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        // omp disables every custom provider when a models-carrying provider
        // lacks "api" (provider or model level) — always set one.
        api: input.api ?? 'openai-completions',
        models: [],
      }));
    } else if (!existing.api) {
      // Existing provider without an api: adding models without one would make
      // the whole models.yml fail omp validation, so fill it.
      doc.setIn(['providers', slug, 'api'], input.api ?? 'openai-completions');
    }

    // `addIn` on a missing key creates a MAP, not a sequence — exactly the
    // `models: must be an array` shape omp rejects. Append through the existing
    // sequence, or seed a new one.
    const modelSeq = doc.getIn(['providers', slug, 'models']);
    if (additions.length > 0) {
      if (isSeq(modelSeq)) {
        for (const model of additions) modelSeq.add(doc.createNode(toModelEntry(model)));
      } else {
        doc.setIn(['providers', slug, 'models'], doc.createNode(additions.map(toModelEntry)));
      }
    }

    const targetModels = doc.getIn(['providers', slug, 'models']);
    if (isSeq(targetModels)) {
      for (const entry of targetModels.items) {
        if (!isMap(entry)) continue;
        const id = entry.get('id');
        if (typeof id !== 'string' || !backfillIds.includes(id)) continue;
        const seed = incomingById.get(id);
        if (seed) backfillEntry(doc, entry, seed);
      }
    }

    // Validate the RESULT against omp's rules, but only refuse over problems
    // this edit introduced: a pre-existing violation elsewhere in the file
    // (which already has omp rejecting every custom provider) must not block an
    // unrelated provider from being added — that would make a broken file
    // unrepairable from the UI.
    const errorsAfter = validateModelsDocument(doc.toJS() as Record<string, unknown>);
    const preExisting = new Set(validateModelsDocument(original));
    const introduced = errorsAfter.filter((error) => !preExisting.has(error));
    if (introduced.length > 0) {
      throw new OmpConfigError(`Refusing to write an invalid models.yml: ${introduced[0]}`);
    }

    return {
      result: {
        written: true,
        addedModels: additions.map((model) => model.id),
        backfilledModels: backfillIds,
        skippedModels: input.models.filter((model) => known.has(model.id)).map((model) => model.id),
      },
      changed: true,
    };
  });
}

export interface OmpProviderRemovalResult {
  removed: boolean;
  removedModels: number;
}

/**
 * Remove a provider from models.yml.
 *
 * The whole entry goes, `modelOverrides` included: leaving the overrides behind
 * keeps a provider entry that still carries `baseUrl`/`apiKey`, so omp goes on
 * listing it as a configured provider whose models no longer exist — a ghost
 * that reappears in the chamber on the next load. Removing the entry is what
 * "delete this provider" means; overrides for a bundled provider live under
 * that bundled provider's own name and are untouched by this call.
 */
export async function removeOmpProvider(slug: string): Promise<OmpProviderRemovalResult> {
  const path = await getModelsConfigPath();
  return withOmpYamlDocument<OmpProviderRemovalResult>(path, (doc) => {
    const providersNode = doc.get('providers');
    if (!isMap(providersNode)) {
      return { result: { removed: false, removedModels: 0 }, changed: false };
    }
    const providerNode = providersNode.get(slug);
    if (!isMap(providerNode)) {
      return { result: { removed: false, removedModels: 0 }, changed: false };
    }
    const models = plainOf(doc, providerNode.get('models'));
    const removedModels = Array.isArray(models) ? models.length : 0;
    providersNode.delete(slug);
    return { result: { removed: true, removedModels }, changed: true };
  });
}
