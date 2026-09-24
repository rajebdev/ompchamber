/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only access to the omp agent's stored provider credentials
 * (~/.omp/agent/models.yml `providers.<slug>.apiKey`, then
 * ~/.omp/agent/agent.db `auth_credentials`). These are omp's own secrets —
 * chamber only reads them to build usage reports and never writes, mutates,
 * logs, or echoes them back over HTTP.
 */

import { join } from 'path';
import { Database } from 'bun:sqlite';
import { getAgentDir } from '@/server/lib/omp/core/paths';
import { getModelsConfigPath } from '@/server/lib/omp/config/models-config';
import { isRecord } from '@/shared/lib/util/guards';

const AUTH_CREDENTIALS_TABLE = 'auth_credentials';
const API_KEY_CREDENTIAL_TYPE = 'api_key';

/** `providers.<slug>.apiKey` from models.yml, or null when absent/blank. */
async function readModelsYmlApiKey(slug: string): Promise<string | null> {
  const path = await getModelsConfigPath();
  if (!(await Bun.file(path).exists())) return null;
  try {
    const data = Bun.YAML.parse(await Bun.file(path).text());
    if (!isRecord(data)) return null;
    const providers = data.providers;
    if (!isRecord(providers)) return null;
    const entry = providers[slug];
    if (!isRecord(entry)) return null;
    const apiKey = entry.apiKey;
    return typeof apiKey === 'string' && apiKey.trim().length > 0 ? apiKey.trim() : null;
  } catch {
    return null; // no-excuse-ok: catch — a malformed models.yml is a soft miss
  }
}

/** The `key` field of a JSON credential blob, or null when absent/non-string. */
function keyFromCredentialJson(data: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null; // no-excuse-ok: catch — malformed credential blob is a soft miss
  }
  if (!isRecord(parsed)) return null;
  const key = parsed.key;
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : null;
}

/** A live, enabled api_key credential for `slug` from agent.db, or null. */
async function readAgentDbApiKey(slug: string): Promise<string | null> {
  const dbPath = join(getAgentDir(), 'agent.db');
  if (!(await Bun.file(dbPath).exists())) return null;
  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<{ data?: string }, [string, string]>(
        `SELECT data FROM ${AUTH_CREDENTIALS_TABLE}
       WHERE provider = ? AND credential_type = ? AND disabled_cause IS NULL
       LIMIT 1`,
      )
      .get(slug, API_KEY_CREDENTIAL_TYPE);
    if (!row || typeof row.data !== 'string' || row.data.length === 0) return null;
    return keyFromCredentialJson(row.data);
  } catch {
    return null; // no-excuse-ok: catch — best-effort read of an external store
  } finally {
    db?.close();
  }
}

/**
 * Resolve a provider's API key from omp's own stores (models.yml, then
 * agent.db), without consulting the app DB. Returns null when no live
 * credential exists. The raw key never leaves omp-domain code — callers must
 * not log or serialize it.
 */
export async function readOmpProviderApiKey(slug: string): Promise<string | null> {
  const fromYml = await readModelsYmlApiKey(slug);
  if (fromYml) return fromYml;
  return readAgentDbApiKey(slug);
}
