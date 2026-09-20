import { getDb } from '@/server/db.server';
import { readOmpProviderApiKey } from '@/server/lib/omp/core/auth-credentials';
import { isRecord } from '@/shared/lib/util/guards';

const SETTINGS_KEY = 'omp_providers_config';
const MASKED_KEY_PATTERN = /•{3,}/;

interface ProviderEntry {
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

async function loadProviderEntries(): Promise<ProviderEntry[]> {
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
