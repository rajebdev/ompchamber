/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What to TELL the user after a provider was added or re-fetched.
 *
 * The message depends on the shape that was written, not on the model count,
 * because two of the three shapes have no local model list BY DESIGN: a
 * discovery provider is listed by omp at runtime, and an endpoint override
 * leaves the models to omp's own catalog. Reporting "0 models" for either made
 * a registration that succeeded read as a failure.
 */

import type { ProviderItem } from '@/shared/types';

/** The success/failure line for an Add Provider submission. */
export function addProviderMessage(
  provider: ProviderItem,
  options: { fetchedCount: number; ompNote?: string },
): { text: string; tone: 'success' | 'error' } {
  if (provider.modelSource === 'discovery') {
    return { text: `${provider.name} registered — omp discovers its models on each run.`, tone: 'success' };
  }
  if (provider.modelSource === 'override') {
    return {
      text: `${provider.name} endpoint registered — omp keeps its own model list for this provider.`,
      tone: 'success',
    };
  }
  if (options.fetchedCount > 0) {
    return {
      text: `Fetched ${options.fetchedCount} new model${options.fetchedCount === 1 ? '' : 's'} from the provider.`,
      tone: 'success',
    };
  }
  if (options.fetchedCount === -1) {
    // The listing failed. When omp reported a reason it is the actionable half,
    // so it is quoted rather than replaced by a generic line.
    return {
      text: options.ompNote
        ? `Provider registered, but models could not be listed: ${options.ompNote}`
        : 'Auto-fetch models failed — provider added with default models.',
      tone: 'error',
    };
  }
  return { text: `${provider.name} registered — no new models to add.`, tone: 'success' };
}

/**
 * The extra line reported after a manual "fetch models": what the chamber wrote
 * into `models.yml` versus what omp already had. A file write and a model-count
 * change are different outcomes, and conflating them hid a failed write.
 */
export function fetchModelsNote(result: {
  omp?: { written: boolean; addedCount: number; backfilledCount: number; reason?: string };
}): { text: string; tone: 'success' | 'error' } | null {
  if (!result.omp) return null;
  if (result.omp.written) {
    const parts: string[] = [];
    if (result.omp.addedCount > 0) {
      parts.push(`${result.omp.addedCount} new model${result.omp.addedCount === 1 ? '' : 's'} registered`);
    }
    if (result.omp.backfilledCount > 0) {
      parts.push(`${result.omp.backfilledCount} model${result.omp.backfilledCount === 1 ? '' : 's'} enriched`);
    }
    return {
      text: `omp models.yml updated${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.`,
      tone: 'success',
    };
  }
  if (result.omp.reason) {
    return { text: `omp models.yml not updated: ${result.omp.reason}`, tone: 'error' };
  }
  return null;
}
