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

import fs from 'fs';
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
export async function enableNativeProvider(slug: string): Promise<boolean> {
  const path = configPath();
  const file = Bun.file(path);
  if (!(await file.exists())) return false;
  const doc = Bun.YAML.parse(await file.text());
  if (!isRecord(doc)) return false;
  const current = readDisabledProviderSlugs(doc);
  const next = current.filter((item) => item !== slug);
  if (next.length === current.length) return false;
  doc.disabledProviders = next;
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await Bun.write(temp, Bun.YAML.stringify(doc, null, 2));
  await fs.promises.rename(temp, path);
  return true;
}

/**
 * Disable a provider by appending it to config.yml disabledProviders — the
 * mirror of enableNativeProvider. Written to the agent's own registry so a
 * later provider merge cannot resurrect it as connected. Creates config.yml
 * when absent; returns false when the provider was already disabled.
 */
export async function disableNativeProvider(slug: string): Promise<boolean> {
  const path = configPath();
  const file = Bun.file(path);
  const source = (await file.exists()) ? await file.text() : '';
  const doc = Bun.YAML.parse(source);
  if (doc !== null && !isRecord(doc)) {
    throw new Error(`${path} must contain a YAML mapping`);
  }
  const disabled = isRecord(doc) ? readDisabledProviderSlugs(doc) : [];
  if (disabled.includes(slug)) return false;

  await fs.promises.mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  if (isRecord(doc)) {
    doc.disabledProviders = [...disabled, slug];
    await Bun.write(temp, Bun.YAML.stringify(doc, null, 2));
  } else {
    await Bun.write(temp, Bun.YAML.stringify({ disabledProviders: [slug] }, null, 2));
  }
  await fs.promises.rename(temp, path);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
