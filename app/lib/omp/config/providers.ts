/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native OMP provider access — models.yml discovery + config.yml
 * disabledProviders writes. Faithful adaptation of omp-web/lib/omp/models-config.ts
 * and omp-web/app/api/providers/enable/route.ts.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMap, parseDocument } from 'yaml';
import { getAgentDir } from '@/lib/omp/core/paths';

/** Path of the native OMP models config (~/.omp/agent/models.yml). */
export function getModelsConfigPath(): string {
  const yml = join(getAgentDir(), 'models.yml');
  return existsSync(yml) ? yml : join(getAgentDir(), 'models.yaml');
}

export interface NativeProviderInfo {
  /** Provider slug, e.g. "deepseek" or "custom/my-gateway". */
  slug: string;
  /** Base URL of the provider API, when configured. */
  baseUrl?: string;
  /** Model ids registered under this provider in models.yml. */
  modelIds: string[];
}

/**
 * Read custom providers/models registered in models.yml. Returns [] when the
 * file is missing or has no providers — never throws for absent files.
 */
export function readNativeProviders(): NativeProviderInfo[] {
  const path = getModelsConfigPath();
  if (!existsSync(path)) return [];
  try {
    const doc = parseDocument(readFileSync(path, 'utf8'));
    if (doc.errors.length > 0) return [];
    const data = doc.toJS();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
    const providers = (data as Record<string, unknown>).providers;
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return [];
    return Object.entries(providers as Record<string, unknown>).map(([slug, value]) => {
      const info: NativeProviderInfo = { slug, modelIds: [] };
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.baseUrl === 'string') info.baseUrl = record.baseUrl;
        if (typeof record.models === 'object' && record.models !== null && !Array.isArray(record.models)) {
          info.modelIds = Object.keys(record.models as Record<string, unknown>);
        } else if (Array.isArray(record.models)) {
          info.modelIds = record.models.filter((m): m is string => typeof m === 'string');
        }
      }
      return info;
    });
  } catch {
    return [];
  }
}

/**
 * Re-enable a disabled provider: remove it from config.yml disabledProviders
 * with an atomic read-modify-write that preserves all other keys (same
 * technique as roles.ts writeModelRoles). Returns false when the provider was
 * not disabled in the first place.
 */
export function enableNativeProvider(slug: string): boolean {
  const path = join(getAgentDir(), 'config.yml');
  if (!existsSync(path)) return false;
  const doc = parseDocument(readFileSync(path, 'utf8'));
  if (doc.errors.length > 0) throw new Error(`${path} is not valid YAML: ${doc.errors[0].message}`);
  if (!isMap(doc.contents)) return false;
  const current = doc.get('disabledProviders');
  if (!Array.isArray(current)) return false;
  const next = current.filter((item): item is string => typeof item === 'string' && item !== slug);
  if (next.length === current.length) return false;
  doc.set('disabledProviders', next);
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, doc.toString(), 'utf8');
  renameSync(temp, path);
  return true;
}
