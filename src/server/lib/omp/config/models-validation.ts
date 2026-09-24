/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation of a `models.yml` document against the rules omp enforces on load
 * (`validateProviderConfiguration` + `ModelsConfigSchema` in omp's
 * `config/models-config.ts`).
 *
 * omp's failure mode is what makes this necessary: a schema violation anywhere
 * in the file disables EVERY custom provider at once — `Warning: models.yml
 * validation failed — custom providers disabled` — so one malformed model
 * entry takes the whole registry down, not just its own provider. The chamber
 * writes this file, so it must not be the one that produces an invalid one.
 *
 * Only the rules the chamber can actually violate are checked; unknown keys are
 * ignored because omp's schema ignores them too.
 */

import { isRecord } from '@/shared/lib/util/guards';

/** `api` values omp's `ApiSchema` accepts. */
const API_VALUES = new Set([
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
  'anthropic-messages',
  'bedrock-converse-stream',
  'google-generative-ai',
  'google-gemini-cli',
  'google-vertex',
  'openrouter-decisions',
  'typesafe',
]);

/** Auth modes that make an `apiKey` optional (omp: `ProviderAuthSchema`). */
const KEYLESS_AUTH = new Set(['none', 'oauth']);

/** A finite number, which is what omp's `"number"` type means — `NaN` and `Infinity` are rejected. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Positive finite number, or absent — the only shape omp accepts for a token limit. */
function isOptionalPositive(value: unknown): boolean {
  return value === undefined || (isFiniteNumber(value) && value > 0);
}

/**
 * Every reason the document would fail omp's load. Empty means omp will accept
 * it; each message mirrors omp's own wording so a surfaced error reads the same
 * as the warning omp would have printed.
 */
export function validateModelsDocument(doc: Record<string, unknown> | null | undefined): string[] {
  const errors: string[] = [];
  if (!doc) return errors;
  const providers = doc.providers;
  if (providers === undefined) return errors;
  if (!isRecord(providers)) return ['providers must be a mapping'];

  for (const [slug, value] of Object.entries(providers)) {
    if (!isRecord(value)) {
      errors.push(`Provider ${slug}: must be a mapping`);
      continue;
    }
    const providerApi = value.api;
    if (providerApi !== undefined && !API_VALUES.has(String(providerApi))) {
      errors.push(`Provider ${slug}: unknown "api" value ${JSON.stringify(providerApi)}`);
    }
    if (typeof value.baseUrl === 'string' && value.baseUrl.length === 0) {
      errors.push(`Provider ${slug}: "baseUrl" must be a non-empty string`);
    }
    if (typeof value.apiKey === 'string' && value.apiKey.length === 0) {
      errors.push(`Provider ${slug}: "apiKey" must be a non-empty string`);
    }

    const models = value.models;
    if (models !== undefined && !Array.isArray(models)) {
      // omp: `models: must be an array (was an object)`. The map form is the
      // most damaging mistake here — omp rejects the whole file, so it must
      // never reach disk.
      errors.push(`Provider ${slug}: "models" must be an array`);
      continue;
    }
    const modelList = Array.isArray(models) ? models : [];

    if (modelList.length > 0) {
      if (typeof value.baseUrl !== 'string' || value.baseUrl.length === 0) {
        errors.push(`Provider ${slug}: "baseUrl" is required when defining custom models.`);
      }
      const auth = value.auth === undefined ? 'apiKey' : String(value.auth);
      if (typeof value.apiKey !== 'string' && !KEYLESS_AUTH.has(auth)) {
        errors.push(`Provider ${slug}: "apiKey" is required when defining custom models unless auth is "none" or "oauth".`);
      }
    } else if (!value.baseUrl && !value.apiKey && !value.discovery && value.auth !== 'none' && !value.modelOverrides) {
      errors.push(`Provider ${slug}: must specify "baseUrl", "apiKey", "auth: none", "discovery", "modelOverrides", or "models"`);
    }

    for (const [index, model] of modelList.entries()) {
      if (!isRecord(model)) {
        errors.push(`Provider ${slug}, model #${index}: must be a mapping`);
        continue;
      }
      const id = model.id;
      if (typeof id !== 'string' || id.length === 0) {
        errors.push(`Provider ${slug}: model missing "id"`);
        continue;
      }
      if (model.api !== undefined && !API_VALUES.has(String(model.api))) {
        errors.push(`Provider ${slug}, model ${id}: unknown "api" value ${JSON.stringify(model.api)}`);
      }
      if (providerApi === undefined && model.api === undefined) {
        errors.push(`Provider ${slug}, model ${id}: no "api" specified. Set at provider or model level.`);
      }
      if (!isOptionalPositive(model.contextWindow)) {
        errors.push(`Provider ${slug}, model ${id}: invalid contextWindow`);
      }
      if (!isOptionalPositive(model.maxTokens)) {
        errors.push(`Provider ${slug}, model ${id}: invalid maxTokens`);
      }
      const cost = model.cost;
      if (cost !== undefined) {
        if (!isRecord(cost)) {
          errors.push(`Provider ${slug}, model ${id}: "cost" must be a mapping`);
          continue;
        }
        for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
          if (!isFiniteNumber(cost[field])) {
            errors.push(`Provider ${slug}, model ${id}: cost.${field} must be a number`);
          }
        }
      }
    }
  }
  return errors;
}

/**
 * Drops model fields omp would reject instead of letting them reach the file —
 * a non-finite price is a value the provider listing produced, not user intent,
 * so the honest repair is to omit the price and keep the model.
 */
export function sanitizeModelEntry(model: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...model };
  const cost = next.cost;
  if (isRecord(cost)) {
    const fields = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
    if (fields.every((field) => isFiniteNumber(cost[field]))) {
      next.cost = { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite };
    } else {
      delete next.cost;
    }
  }
  if (!isOptionalPositive(next.contextWindow)) delete next.contextWindow;
  if (!isOptionalPositive(next.maxTokens)) delete next.maxTokens;
  return next;
}
