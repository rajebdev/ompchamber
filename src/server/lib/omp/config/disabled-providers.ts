/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read/write of the native OMP `disabledProviders` list in
 * ~/.omp/agent/config.yml — the flag behind connect/disconnect in the provider
 * settings. Writes are atomic read-modify-writes that preserve every other key
 * in the file.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

function configPath(): string {
  return join(getAgentDir(), 'config.yml');
}

function readDisabledProviderSlugs(data: Record<string, unknown>): string[] {
  const current = data.disabledProviders;
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
  const doc = Bun.YAML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(doc)) return false;
  const current = readDisabledProviderSlugs(doc);
  const next = current.filter((item) => item !== slug);
  if (next.length === current.length) return false;
  doc.disabledProviders = next;
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, Bun.YAML.stringify(doc, null, 2), 'utf8');
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
  const doc = Bun.YAML.parse(source);
  if (doc !== null && !isRecord(doc)) {
    throw new Error(`${path} must contain a YAML mapping`);
  }
  const disabled = isRecord(doc) ? readDisabledProviderSlugs(doc) : [];
  if (disabled.includes(slug)) return false;

  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  if (isRecord(doc)) {
    doc.disabledProviders = [...disabled, slug];
    writeFileSync(temp, Bun.YAML.stringify(doc, null, 2), 'utf8');
  } else {
    writeFileSync(temp, Bun.YAML.stringify({ disabledProviders: [slug] }, null, 2), 'utf8');
  }
  renameSync(temp, path);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
