/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read/write of the native OMP role selectors (`modelRoles`) in
 * ~/.omp/agent/config.yml — the access-control mapping of role → model
 * selector used by omp (e.g. the advisor role). Faithful port of
 * omp-web/lib/omp/model-roles.ts.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

export type ModelRoles = Record<string, string>;

function configPath(): string {
  return join(getAgentDir(), 'config.yml');
}

/** Reads the native OMP role selectors from config.yml without touching other settings. */
export function readModelRoles(): { path: string; roles: ModelRoles } {
  const path = configPath();
  if (!existsSync(path)) return { path, roles: {} };
  const data = Bun.YAML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(data) || !isRecord(data.modelRoles)) return { path, roles: {} };
  return {
    path,
    roles: Object.fromEntries(Object.entries(data.modelRoles).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
  };
}

/** Updates only modelRoles, preserving the user's remaining native OMP config. */
export function writeModelRoles(roles: ModelRoles): void {
  const path = configPath();
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const doc = asMapping(Bun.YAML.parse(source), path);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  doc.modelRoles = roles;
  writeFileSync(temp, Bun.YAML.stringify(doc, null, 2), 'utf8');
  renameSync(temp, path);
}

export function readDisabledProviders(): Set<string> {
  const path = configPath();
  if (!existsSync(path)) return new Set();
  const data = Bun.YAML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(data) || !Array.isArray(data.disabledProviders)) return new Set();
  return new Set(data.disabledProviders.filter((provider): provider is string => typeof provider === 'string'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses a YAML file that must be a top-level mapping; throws otherwise. */
function asMapping(parsed: unknown, path: string): Record<string, unknown> {
  if (!isRecord(parsed)) throw new Error(`${path} must contain a YAML mapping`);
  return parsed;
}
