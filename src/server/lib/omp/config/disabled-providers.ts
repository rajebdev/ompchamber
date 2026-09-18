/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read/write of the native OMP `disabledProviders` list in
 * ~/.omp/agent/config.yml — the flag behind connect/disconnect in the provider
 * settings. Writes are atomic read-modify-writes that preserve every other key
 * and comment in the file.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { isMap, parseDocument, stringify, type Document } from 'yaml';
import { getAgentDir } from '@/server/lib/omp/core/paths';

function configPath(): string {
  return join(getAgentDir(), 'config.yml');
}

/**
 * Read disabledProviders as plain strings. doc.get() hands back a YAMLSeq node
 * (never an Array), so the value must be materialised via toJS() first — an
 * Array.isArray() check on the node is always false and silently reports "none
 * disabled", which would make a write drop the entries already in the file.
 */
function readDisabledProviderSlugs(doc: Document): string[] {
  const data = doc.toJS();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  const current = (data as Record<string, unknown>).disabledProviders;
  return Array.isArray(current)
    ? current.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Re-enable a disabled provider by removing it from config.yml
 * disabledProviders. Returns false when it was not disabled in the first place.
 */
export function enableNativeProvider(slug: string): boolean {
  const path = configPath();
  if (!existsSync(path)) return false;
  const doc = parseDocument(readFileSync(path, 'utf8'));
  if (doc.errors.length > 0) throw new Error(`${path} is not valid YAML: ${doc.errors[0].message}`);
  if (!isMap(doc.contents)) return false;
  const current = readDisabledProviderSlugs(doc);
  const next = current.filter((item) => item !== slug);
  if (next.length === current.length) return false;
  doc.set('disabledProviders', next);
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, doc.toString(), 'utf8');
  renameSync(temp, path);
  return true;
}

/**
 * Disable a provider by appending it to config.yml disabledProviders — the
 * mirror of enableNativeProvider. Written to the agent's own registry so a
 * later provider merge cannot resurrect it as connected. Creates config.yml
 * when absent; returns false when the provider was already disabled.
 */
export function disableNativeProvider(slug: string): boolean {
  const path = configPath();
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const doc = parseDocument(source);
  if (doc.errors.length > 0) throw new Error(`${path} is not valid YAML: ${doc.errors[0].message}`);
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error(`${path} must contain a YAML mapping`);
  }
  const disabled = isMap(doc.contents) ? readDisabledProviderSlugs(doc) : [];
  if (disabled.includes(slug)) return false;

  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  if (isMap(doc.contents)) {
    doc.set('disabledProviders', [...disabled, slug]);
    writeFileSync(temp, doc.toString(), 'utf8');
  } else {
    writeFileSync(temp, stringify({ disabledProviders: [slug] }), 'utf8');
  }
  renameSync(temp, path);
  return true;
}
