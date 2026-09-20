/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery + toggle — scans .omp/extensions (user + project) and
 * reads/writes config.yml disabledExtensions ids
 * (`extension-module:<name>`, `skill:<name>`, `context-file:<level>:<basename>`).
 */

import { join } from 'path';
import { getAgentDir, pathExists } from '@/server/lib/omp/core/paths';
import { writeFileAtomic } from '@/server/lib/fs/atomic-write';
import { asMapping, getOmpConfigPath } from '@/server/lib/omp/config/yaml';
import { isRecord } from '@/shared/lib/util/guards';

export interface DiscoveredExtension {
  id: string;
  name: string;
  /** Which root the extension file came from. */
  sourceRoot: 'user' | 'project';
  filePath: string;
  disabled: boolean;
}

const EXTENSION_GLOB = new Bun.Glob('*.{ts,js,mjs,cjs}');
const MAX_EXTENSION_BYTES = 2 * 1024 * 1024;

async function scanExtensionsDir(dir: string, sourceRoot: 'user' | 'project', disabled: Set<string>): Promise<DiscoveredExtension[]> {
  if (!(await pathExists(dir))) return [];
  try {
    const found: DiscoveredExtension[] = [];
    for (const relativePath of await Array.fromAsync(EXTENSION_GLOB.scan({ cwd: dir, onlyFiles: true }))) {
      const filePath = join(dir, relativePath);
      try {
        if ((await Bun.file(filePath).stat()).size > MAX_EXTENSION_BYTES) continue;
      } catch {
        continue;
      }
      const name = relativePath.replace(/\.(ts|js|mjs|cjs)$/, '');
      const id = `extension-module:${name}`;
      found.push({ id, name, sourceRoot, filePath, disabled: disabled.has(id) });
    }
    return found;
  } catch {
    return [];
  }
}

/** Discover extensions from the user root (+ project root when given). */
export async function discoverExtensions(projectDir?: string): Promise<DiscoveredExtension[]> {
  const disabled = await readDisabledExtensions();
  const userDir = join(getAgentDir(), 'extensions');
  const byName = new Map<string, DiscoveredExtension>();
  for (const ext of await scanExtensionsDir(userDir, 'user', disabled)) byName.set(ext.name, ext);
  if (projectDir) {
    for (const ext of await scanExtensionsDir(join(projectDir, '.omp', 'extensions'), 'project', disabled)) {
      if (!byName.has(ext.name)) byName.set(ext.name, ext);
    }
  }
  return [...byName.values()];
}

export async function readDisabledExtensions(): Promise<Set<string>> {
  const path = getOmpConfigPath();
  const file = Bun.file(path);
  if (!(await file.exists()) || (await file.stat()).size >= 8 * 1024 * 1024) return new Set();
  try {
    const data = Bun.YAML.parse(await file.text());
    if (!isRecord(data) || !Array.isArray(data.disabledExtensions)) return new Set();
    return new Set(data.disabledExtensions.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

/** Toggle one extension id in config.yml disabledExtensions atomically. */
export async function setExtensionDisabled(id: string, disabled: boolean): Promise<boolean> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('Invalid extension id');
  const path = getOmpConfigPath();
  const doc = asMapping(Bun.YAML.parse((await Bun.file(path).exists()) ? await Bun.file(path).text() : ''), path);
  const already = (await readDisabledExtensions()).has(id);
  if (disabled === already) return false;
  const list = [...(await readDisabledExtensions())];
  const next = disabled ? [...list, id] : list.filter((item) => item !== id);
  doc.disabledExtensions = next;
  await writeFileAtomic(path, Bun.YAML.stringify(doc, null, 2));
  return true;
}
