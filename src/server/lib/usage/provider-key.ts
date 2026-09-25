import { getDb } from '@/server/db.server';
import { fetchOmpRegistrySnapshot } from '@/server/lib/models/provider-registry.server';
import { listAgentDbCredentialSlugs, listModelsYmlCredentialSlugs, readOmpProviderApiKey } from '@/server/lib/omp/core/auth-credentials';
import { isRecord } from '@/shared/lib/util/guards';

const SETTINGS_KEY = 'omp_providers_config';
const MASKED_KEY_PATTERN = /•{3,}/;

export interface ProviderEntry {
  name: string;
  slug: string;
  baseUrl: string;
  apiKey: string;
}

function toProviderEntry(value: unknown): ProviderEntry | null {
  if (!isRecord(value)) return null;
  return {
    name: typeof value.name === 'string' ? value.name : '',
    slug: typeof value.slug === 'string' ? value.slug : '',
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
  };
}

/** The chamber's own provider overlay rows (app DB), unvalidated. */
export async function loadProviderEntries(): Promise<ProviderEntry[]> {
  const db = await getDb();
  const row = await db.get<{ value?: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [SETTINGS_KEY],
  );
  if (!row || typeof row.value !== 'string' || row.value.trim().length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(toProviderEntry)
    .filter((entry): entry is ProviderEntry => entry !== null);
}

/**
 * Resolve a provider key: first the app DB (`app_settings.omp_providers_config`,
 * matching via `predicate` and rejecting masked placeholders like "••••••"),
 * then — when the app DB has no usable key — omp's own credential stores
 * (models.yml `providers.<slug>.apiKey`, then agent.db `auth_credentials`).
 * Returns the raw key — callers must never serialize, log, or echo it back.
 */
async function resolveApiKey(
  slug: string,
  predicate: (entry: ProviderEntry) => boolean,
): Promise<string | null> {
  const entries = await loadProviderEntries();
  for (const entry of entries) {
    if (!predicate(entry)) continue;
    const key = entry.apiKey.trim();
    if (key.length === 0 || MASKED_KEY_PATTERN.test(key)) continue;
    return key;
  }
  return readOmpProviderApiKey(slug);
}

/** Resolve the Kenari provider key (baseUrl kenari.id, or name/slug "kenari"). */
export function resolveKenariApiKey(): Promise<string | null> {
  return resolveApiKey('kenari', (entry) =>
    entry.baseUrl.toLowerCase().includes('kenari.id') ||
    entry.name.toLowerCase().includes('kenari') ||
    entry.slug.toLowerCase().includes('kenari'),
  );
}

/** Resolve the DeepSeek provider key (baseUrl deepseek.com, or name/slug "deepseek"). */
export function resolveDeepSeekApiKey(): Promise<string | null> {
  return resolveApiKey('deepseek', (entry) =>
    entry.baseUrl.toLowerCase().includes('deepseek.com') ||
    entry.name.toLowerCase().includes('deepseek') ||
    entry.slug.toLowerCase().includes('deepseek'),
  );
}

/** A provider slug with at least one usable credential, and where it came from. */
export interface CredentialedProvider {
  slug: string;
  /** Human-readable credential stores, e.g. ["models.yml", "agent.db"]. */
  sources: string[];
}

/** Slugs configured in the chamber's own provider overlay (app DB). */
async function appDbSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (const entry of await loadProviderEntries()) {
    const key = entry.apiKey.trim();
    if (key.length === 0 || MASKED_KEY_PATTERN.test(key)) continue;
    const slug = (entry.slug || entry.name).trim().toLowerCase();
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/**
 * Slugs omp itself considers usable. This is the authoritative signal, because
 * omp resolves credentials from places the chamber cannot enumerate — an
 * `ANTHROPIC_API_KEY`-style environment variable is invisible to a models.yml /
 * agent.db scan, yet omp happily runs on it. Two omp views are unioned:
 *
 *  - `get_login_providers` → `authenticated`, omp's own credential check;
 *  - `get_available_models` → a provider serving models has a registered
 *    credential (omp rejects a models.yml entry without an apiKey).
 */
async function ompRegistrySlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  try {
    const { providers, models } = await fetchOmpRegistrySnapshot();
    for (const provider of providers) {
      if (provider.authenticated) slugs.add(provider.id.trim().toLowerCase());
    }
    for (const model of models) slugs.add(model.provider.trim().toLowerCase());
  } catch {
    // no-excuse-ok: catch — a cold/busy omp degrades to the store-based scan
  }
  return slugs;
}

/**
 * Every provider omp can currently authenticate, with the stores that supplied
 * a credential. A provider absent from this list has no usable key and must not
 * be surfaced in the usage UI. Never returns credential values.
 */
export async function listCredentialedProviders(): Promise<CredentialedProvider[]> {
  const [appDb, modelsYml, agentDb, registry] = await Promise.all([
    appDbSlugs(),
    listModelsYmlCredentialSlugs(),
    listAgentDbCredentialSlugs(),
    ompRegistrySlugs(),
  ]);

  const sourcesBySlug = new Map<string, string[]>();
  const add = (slug: string, source: string) => {
    const sources = sourcesBySlug.get(slug) ?? [];
    if (!sources.includes(source)) sources.push(source);
    sourcesBySlug.set(slug, sources);
  };
  for (const slug of modelsYml) add(slug, 'models.yml');
  for (const slug of agentDb) add(slug, 'agent.db');
  for (const slug of appDb) add(slug, 'app DB');
  // A provider omp resolves but no store accounts for: an environment variable
  // or one of omp's own bundled defaults.
  for (const slug of registry) {
    if (!sourcesBySlug.has(slug)) add(slug, 'environment');
  }

  return [...sourcesBySlug.entries()]
    .map(([slug, sources]) => ({ slug, sources }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
