/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery + toggle — scans .omp/extensions (user + project) and
 * reads/writes config.yml disabledExtensions ids
 * (`extension-module:<name>`, `skill:<name>`, `context-file:<level>:<basename>`).
 */

import fs from 'fs';
import { join } from 'path';
import { getAgentDir, pathExists } from '@/server/lib/omp/core/paths';
import { isRecord } from '@/server/lib/omp/config/mcp';

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
    for (const relativePath of EXTENSION_GLOB.scanSync({ cwd: dir, onlyFiles: true })) {
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
  const path = join(getAgentDir(), 'config.yml');
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
  const path = join(getAgentDir(), 'config.yml');
  const doc = asMapping(Bun.YAML.parse((await Bun.file(path).exists()) ? await Bun.file(path).text() : ''), path);
  const already = (await readDisabledExtensions()).has(id);
  if (disabled === already) return false;
  const list = [...(await readDisabledExtensions())];
  const next = disabled ? [...list, id] : list.filter((item) => item !== id);
  doc.disabledExtensions = next;
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await Bun.write(temp, Bun.YAML.stringify(doc, null, 2));
  await fs.promises.rename(temp, path);
  return true;
}

/** Parses a YAML file that must be a top-level mapping; throws otherwise. */
function asMapping(parsed: unknown, path: string): Record<string, unknown> {
  if (!isRecord(parsed)) throw new Error(`${path} must contain a YAML mapping`);
  return parsed;
}
