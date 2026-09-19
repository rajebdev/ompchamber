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

import fs from 'fs';
import { dirname, join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

export type ModelRoles = Record<string, string>;

function configPath(): string {
  return join(getAgentDir(), 'config.yml');
}

/** Reads the native OMP role selectors from config.yml without touching other settings. */
export async function readModelRoles(): Promise<{ path: string; roles: ModelRoles }> {
  const path = configPath();
  if (!(await Bun.file(path).exists())) return { path, roles: {} };
  const data = Bun.YAML.parse(await Bun.file(path).text());
  if (!isRecord(data) || !isRecord(data.modelRoles)) return { path, roles: {} };
  return {
    path,
    roles: Object.fromEntries(Object.entries(data.modelRoles).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
  };
}

/** Updates only modelRoles, preserving the user's remaining native OMP config. */
export async function writeModelRoles(roles: ModelRoles): Promise<void> {
  const path = configPath();
  const source = (await Bun.file(path).exists()) ? await Bun.file(path).text() : '';
  const doc = asMapping(Bun.YAML.parse(source), path);
  await fs.promises.mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  doc.modelRoles = roles;
  await Bun.write(temp, Bun.YAML.stringify(doc, null, 2));
  await fs.promises.rename(temp, path);
}

export async function readDisabledProviders(): Promise<Set<string>> {
  const path = configPath();
  if (!(await Bun.file(path).exists())) return new Set();
  const data = Bun.YAML.parse(await Bun.file(path).text());
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
