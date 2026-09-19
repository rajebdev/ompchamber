/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery + toggle — scans .omp/extensions (user + project) and
 * reads/writes config.yml disabledExtensions ids
 * (`extension-module:<name>`, `skill:<name>`, `context-file:<level>:<basename>`).
 */

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';
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

function scanExtensionsDir(dir: string, sourceRoot: 'user' | 'project', disabled: Set<string>): DiscoveredExtension[] {
  if (!existsSync(dir)) return [];
  try {
    return [...EXTENSION_GLOB.scanSync({ cwd: dir, onlyFiles: true })].flatMap((relativePath) => {
      const filePath = join(dir, relativePath);
      try {
        if (statSync(filePath).size > MAX_EXTENSION_BYTES) return [];
      } catch {
        return [];
      }
      const name = relativePath.replace(/\.(ts|js|mjs|cjs)$/, '');
      const id = `extension-module:${name}`;
      return [{ id, name, sourceRoot, filePath, disabled: disabled.has(id) }];
    });
  } catch {
    return [];
  }
}

/** Discover extensions from the user root (+ project root when given). */
export function discoverExtensions(projectDir?: string): DiscoveredExtension[] {
  const disabled = readDisabledExtensions();
  const userDir = join(getAgentDir(), 'extensions');
  const byName = new Map<string, DiscoveredExtension>();
  for (const ext of scanExtensionsDir(userDir, 'user', disabled)) byName.set(ext.name, ext);
  if (projectDir) {
    for (const ext of scanExtensionsDir(join(projectDir, '.omp', 'extensions'), 'project', disabled)) {
      if (!byName.has(ext.name)) byName.set(ext.name, ext);
    }
  }
  return [...byName.values()];
}

export function readDisabledExtensions(): Set<string> {
  const path = join(getAgentDir(), 'config.yml');
  if (!existsSync(path) || statSync(path).size >= 8 * 1024 * 1024) return new Set();
  try {
    const data = Bun.YAML.parse(readFileSync(path, 'utf8'));
    if (!isRecord(data) || !Array.isArray(data.disabledExtensions)) return new Set();
    return new Set(data.disabledExtensions.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

/** Toggle one extension id in config.yml disabledExtensions atomically. */
export function setExtensionDisabled(id: string, disabled: boolean): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('Invalid extension id');
  const path = join(getAgentDir(), 'config.yml');
  const doc = asMapping(Bun.YAML.parse(existsSync(path) ? readFileSync(path, 'utf8') : ''), path);
  const already = readDisabledExtensions().has(id);
  if (disabled === already) return false;
  const list = [...readDisabledExtensions()];
  const next = disabled ? [...list, id] : list.filter((item) => item !== id);
  doc.disabledExtensions = next;
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, Bun.YAML.stringify(doc, null, 2), 'utf8');
  renameSync(temp, path);
  return true;
}

/** Parses a YAML file that must be a top-level mapping; throws otherwise. */
function asMapping(parsed: unknown, path: string): Record<string, unknown> {
  if (!isRecord(parsed)) throw new Error(`${path} must contain a YAML mapping`);
  return parsed;
}
