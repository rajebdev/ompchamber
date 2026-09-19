/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * omp config CLI bridge — schema-aware get/set/list/reset over the real
 * `omp config` command (498-key SETTINGS_SCHEMA with {value,type,description}
 * metadata). Shell-out instead of RPC because omp exposes no config get/set
 * RPC command; the CLI is fast (~0.3s) and authoritative.
 */

import { isMockMode } from '@/server/mock.server';

export interface ConfigEntry {
  value?: unknown;
  type: string;
  description: string;
}

const BINARY = 'omp';
const LIST_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 15_000;

function runOmp(args: string[], timeoutMs: number): Promise<string> {
  return (async () => {
    const proc = Bun.spawn({
      cmd: [BINARY, ...args],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`omp ${args[0]} failed: exited with code ${exitCode}`);
    return stdout;
  })();
}

/** Full schema snapshot: key → {value?, type, description}. Empty in mock mode. */
export async function listOmpConfig(): Promise<Record<string, ConfigEntry>> {
  if (isMockMode()) return {};
  const stdout = await runOmp(['config', 'list', '--json'], LIST_TIMEOUT_MS);
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('omp config list returned unexpected JSON');
  }
  const entries: Record<string, ConfigEntry> = {};
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    entries[key] = {
      value: record.value,
      type: typeof record.type === 'string' ? record.type : 'unknown',
      description: typeof record.description === 'string' ? record.description : '',
    };
  }
  return entries;
}

/** Read one config key's current value (undefined when unset). */
export async function getOmpConfigValue(key: string): Promise<unknown> {
  if (isMockMode()) return undefined;
  const stdout = await runOmp(['config', 'get', key], WRITE_TIMEOUT_MS);
  const text = stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Write one config key; returns the value omp reports after the write.
 * Arrays/records serialize to JSON strings, which `omp config set` parses
 * against the key's schema type. */
export async function setOmpConfigValue(
  key: string,
  value: string | number | boolean | unknown[] | Record<string, unknown>,
): Promise<unknown> {
  if (isMockMode()) throw new Error('config writes are unavailable in mock mode');
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await runOmp(['config', 'set', key, serialized], WRITE_TIMEOUT_MS);
  return getOmpConfigValue(key);
}

/** Reset one config key to its schema default. */
export async function resetOmpConfigKey(key: string): Promise<unknown> {
  if (isMockMode()) throw new Error('config writes are unavailable in mock mode');
  await runOmp(['config', 'reset', key], WRITE_TIMEOUT_MS);
  return getOmpConfigValue(key);
}
