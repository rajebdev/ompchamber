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

import { isMap, isSeq, type YAMLMap } from 'yaml';
import { getModelsConfigPath } from '@/server/lib/omp/config/models-config';
import { plainOf, withOmpYamlDocument, OmpConfigError } from '@/server/lib/omp/config/document';
import { validateModelsDocument } from '@/server/lib/omp/config/models-validation';
import {
  backfillableIds,
  backfillEntry,
  knownModelIds,
  toModelEntry,
  type OmpProviderModelSeed,
} from '@/server/lib/omp/config/provider-seeds';
import { isMaskedApiKey } from '@/shared/lib/models/provider/dialect';
import type {
  OmpProviderApi,
  ProviderAuthMode,
  ProviderDiscoveryType,
} from '@/shared/types/settings/provider';

export type { OmpProviderModelSeed } from '@/server/lib/omp/config/provider-seeds';

export interface OmpProviderUpsertInput {
  baseUrl: string;
  apiKey?: string;
  api?: OmpProviderApi;
  /**
   * omp's auth mode. `none` is what registers a keyless local server: without
   * it omp demands an `apiKey` and rejects the provider as unconfigured.
   */
  auth?: ProviderAuthMode;
  /**
   * Let OMP list this provider's models live instead of the chamber writing a
   * snapshot of ids. A discovery provider is legitimately registered with an
   * empty `models` array.
   */
  discovery?: ProviderDiscoveryType;
  /**
   * Register/override the provider WITHOUT writing any model ids — the shape
   * omp documents as an "override-only provider". Used when the provider is one
   * omp already bundles (its own catalog supplies the models) or when its
   * model list is owned by discovery.
   */
  overrideOnly?: boolean;
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
 * tracking. Existing provider fields (apiKey, baseUrl, api) and existing model
 * entries are never modified; only models whose id is not yet registered are
 * appended, and only fields the entry is MISSING are filled. Merges preserve
 * unrelated keys, comments and formatting (document model), and the write is
 * atomic and mode-preserving.
 *
 * Three provider shapes are written here, and omp's rules differ for each:
 *
 * - **full** (`models` non-empty): `baseUrl` plus an `apiKey` unless
 *   `auth: none`/`oauth`.
 * - **discovery** (`discovery` set): a shell omp lists models from itself. The
 *   model list stays empty — writing ids as well would freeze a snapshot omp
 *   would then serve alongside its live discovery.
 * - **override** (`overrideOnly`, or an empty model list for a provider omp
 *   already bundles): keep omp's own catalog models and only change the
 *   endpoint. A provider with neither models nor any config field is rejected
 *   by omp, so one of `baseUrl`/`apiKey`/`auth: none`/`discovery` must be set.
 *
 * The finished document is validated against omp's own rules before the write:
 * a schema violation anywhere in the file makes omp disable every custom
 * provider at once.
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
    // omp demands an `apiKey` only when a provider carries MODELS: an
    // override-only entry (baseUrl/discovery/auth) is valid without one, which
    // is how a proxy override for a bundled provider keeps using `/login`
    // credentials, and how a keyless local server is declared.
    const overrideOnly = input.overrideOnly === true || input.discovery !== undefined;
    const writesModels = !overrideOnly && input.models.length > 0;
    const keyless = input.auth === 'none' || input.auth === 'oauth';
    const known = knownModelIds(existing);
    const incomingById = new Map(input.models.map((model) => [model.id, model]));
    const additions = input.models.filter((model) => model.id && !known.has(model.id));

    if (!existing && writesModels && !input.apiKey && !keyless) {
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
    if (!existing && writesModels && isMaskedApiKey(input.apiKey)) {
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
    // A discovery provider keeps its empty list: omp owns those models.
    const backfillIds = overrideOnly ? [] : backfillableIds(existing?.models, incomingById);

    // A provider the user re-saves without any new model and without a dialect
    // change has nothing to write — reporting `written: true` there would claim
    // a file edit that never happened. A provider that does NOT exist yet is
    // always a change: the entry itself is the write, which is the whole point
    // of a discovery or override registration that carries no model ids.
    const providerChanged = !existing || Boolean(
      (input.api && !existing.api)
      || (input.auth && input.auth !== 'apiKey' && !existing.auth)
      || (input.discovery && !existing.discovery),
    );

    if (additions.length === 0 && backfillIds.length === 0 && !providerChanged) {
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
        // `auth: none` makes an apiKey optional, so a keyless shell omits it
        // rather than writing an empty string omp rejects.
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        // omp disables every custom provider when a models-carrying provider
        // lacks "api" (provider or model level) — always set one.
        api: input.api ?? 'openai-completions',
        ...(input.auth && input.auth !== 'apiKey' ? { auth: input.auth } : {}),
        ...(input.discovery ? { discovery: { type: input.discovery } } : {}),
        models: [],
      }));
    } else {
      // Add-only: a field the entry already carries belongs to the user, and
      // rewriting it would discard a credential or endpoint they pinned.
      if (!existing.api) {
        doc.setIn(['providers', slug, 'api'], input.api ?? 'openai-completions');
      }
      if (input.auth && input.auth !== 'apiKey' && !existing.auth) {
        doc.setIn(['providers', slug, 'auth'], input.auth);
      }
      if (input.discovery && !existing.discovery) {
        doc.setIn(['providers', slug, 'discovery'], doc.createNode({ type: input.discovery }));
      }
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
