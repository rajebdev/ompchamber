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

import { writeFileAtomic } from '@/server/lib/fs/atomic-write';
import { getOmpConfigPath } from '@/server/lib/omp/config/yaml';
import { isRecord } from '@/shared/lib/util/guards';

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
  const path = getOmpConfigPath();
  const file = Bun.file(path);
  if (!(await file.exists())) return false;
  const doc = Bun.YAML.parse(await file.text());
  if (!isRecord(doc)) return false;
  const current = readDisabledProviderSlugs(doc);
  const next = current.filter((item) => item !== slug);
  if (next.length === current.length) return false;
  doc.disabledProviders = next;
  await writeFileAtomic(path, Bun.YAML.stringify(doc, null, 2));
  return true;
}

/**
 * Disable a provider by appending it to config.yml disabledProviders — the
 * mirror of enableNativeProvider. Written to the agent's own registry so a
 * later provider merge cannot resurrect it as connected. Creates config.yml
 * when absent; returns false when the provider was already disabled.
 */
export async function disableNativeProvider(slug: string): Promise<boolean> {
  const path = getOmpConfigPath();
  const file = Bun.file(path);
  const source = (await file.exists()) ? await file.text() : '';
  const doc = Bun.YAML.parse(source);
  if (doc !== null && !isRecord(doc)) {
    throw new Error(`${path} must contain a YAML mapping`);
  }
  const disabled = isRecord(doc) ? readDisabledProviderSlugs(doc) : [];
  if (disabled.includes(slug)) return false;

  let content: string;
  if (isRecord(doc)) {
    doc.disabledProviders = [...disabled, slug];
    content = Bun.YAML.stringify(doc, null, 2);
  } else {
    content = Bun.YAML.stringify({ disabledProviders: [slug] }, null, 2);
  }
  await writeFileAtomic(path, content);
  return true;
}
