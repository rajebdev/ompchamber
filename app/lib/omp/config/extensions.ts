/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery + toggle — scans .omp/extensions (user + project) and
 * reads/writes config.yml disabledExtensions ids
 * (`extension-module:<name>`, `skill:<name>`, `context-file:<level>:<basename>`).
 */

import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMap, parseDocument } from 'yaml';
import { getAgentDir } from '@/lib/omp/core/paths';
import { isRecord } from '@/lib/omp/config/mcp';

export interface DiscoveredExtension {
  id: string;
  name: string;
  /** Which root the extension file came from. */
  sourceRoot: 'user' | 'project';
  filePath: string;
  disabled: boolean;
}

function scanExtensionsDir(dir: string, sourceRoot: 'user' | 'project', disabled: Set<string>): DiscoveredExtension[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isFile()) return false;
        return /\.(ts|js|mjs|cjs)$/.test(entry.name);
      })
      .flatMap((entry) => {
        const filePath = join(dir, entry.name);
        try {
          if (statSync(filePath).size > 2 * 1024 * 1024) return [];
        } catch {
          return [];
        }
        const name = entry.name.replace(/\.(ts|js|mjs|cjs)$/, '');
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
    const doc = parseDocument(readFileSync(path, 'utf8'));
    if (doc.errors.length > 0) return new Set();
    const data = doc.toJS();
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
  const doc = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : '');
  if (doc.errors.length > 0) throw new Error(`${path} is not valid YAML: ${doc.errors[0].message}`);
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error(`${path} must contain a YAML mapping`);
  }
  const already = readDisabledExtensions().has(id);
  if (disabled === already) return false;
  const list = [...readDisabledExtensions()];
  const next = disabled ? [...list, id] : list.filter((item) => item !== id);
  doc.set('disabledExtensions', next);
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, doc.toString(), 'utf8');
  renameSync(temp, path);
  return true;
}
