/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider registry assembly for the provider settings. Folds the three omp
 * sources — auth login providers, models.yml registrations, config.yml
 * disabledProviders — with the chamber's local SQLite overlay into the
 * ProviderItem list the settings UI renders. Server-only: reads omp config
 * files and drives the shared utility RPC process.
 */

import { readDisabledProviders } from '@/server/lib/omp/config/roles';
import { getModelsConfigPath, readNativeProviders } from '@/server/lib/omp/config/providers';
import { runUtilityCommand, type OmpModel } from '@/server/lib/omp/rpc/utility';
import { isKenariProvider, removeLegacyKenariModels } from '@/shared/lib/models/provider-cleanup';
import { formatContextWindow } from '@/shared/lib/code/format';
import type { ProviderItem } from '@/shared/types';

/** app_settings key holding the chamber-local provider overlay. */
export const PROVIDERS_SETTINGS_KEY = 'omp_providers_config';

const RPC_CACHE_TTL_MS = 60_000;

/** Minimal shape of a get_login_providers entry, as the chamber reads it. */
export interface DetectedLoginProvider {
  id: string;
  name: string;
  authenticated: boolean;
}

function isDetectedLoginProvider(provider: unknown): provider is DetectedLoginProvider {
  return (
    typeof provider === 'object' && provider !== null
    && typeof (provider as { id?: unknown }).id === 'string'
    && typeof (provider as { name?: unknown }).name === 'string'
    && typeof (provider as { authenticated?: unknown }).authenticated === 'boolean'
  );
}

function isOmpModel(model: unknown): model is OmpModel {
  return (
    typeof model === 'object' && model !== null
    && typeof (model as OmpModel).id === 'string'
    && typeof (model as OmpModel).provider === 'string'
  );
}

export interface OmpRegistrySnapshot {
  /** Login providers omp reports (authenticated or not). */
  providers: DetectedLoginProvider[];
  /** Every model omp currently serves. */
  models: OmpModel[];
}

/**
 * Raw omp registry probe — the two commands that define "detected" for the
 * chamber: the login providers omp knows and the models they serve. Parsed here
 * once so the provider settings page and the startup banner count the same set.
 * Throws when the utility RPC is unreachable; each caller degrades its own way.
 */
export async function fetchOmpRegistrySnapshot(): Promise<OmpRegistrySnapshot> {
  const [loginResponse, modelsResponse] = await Promise.all([
    runUtilityCommand<{ providers?: unknown }>({ type: 'get_login_providers' }, 30_000),
    runUtilityCommand<{ models?: unknown }>({ type: 'get_available_models' }, 60_000),
  ]);
  return {
    providers: Array.isArray(loginResponse.providers) ? loginResponse.providers.filter(isDetectedLoginProvider) : [],
    models: Array.isArray(modelsResponse.models) ? modelsResponse.models.filter(isOmpModel) : [],
  };
}

/**
 * Provider registry straight from the omp agent: authenticated login providers
 * (omp auth) plus their registered models (get_available_models). This is the
 * source the composer's model dropdown already uses via /api/models.
 */
async function loadRpcProviderItems(): Promise<ProviderItem[]> {
  const cached = globalThis.__ompChamberProvidersRpcCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const { providers: loginProviders, models: available } = await fetchOmpRegistrySnapshot();
    const disabled = await readDisabledProviders().catch(() => new Set<string>());

    const items = loginProviders.map((provider) => {
      const providerModels = available.filter((model) => model.provider === provider.id);
      const isDisabled = disabled.has(provider.id);
      return {
        id: `omp-auth-${provider.id}`,
        name: provider.name,
        slug: provider.id,
        icon: 'plug',
        status: (provider.authenticated && !isDisabled ? 'connected' : 'disconnected') as ProviderItem['status'],
        disabled: isDisabled,
        configuredIn: 'omp auth credentials',
        models: providerModels.map((model) => ({
          id: model.id,
          name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
          contextWindow: model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K ctx` : '',
          hasTools: true,
          hasVision: false,
          isVisible: true,
        })),
      };
    });
    globalThis.__ompChamberProvidersRpcCache = { data: items, expiresAt: Date.now() + RPC_CACHE_TTL_MS };
    return items;
  } catch {
    // RPC unavailable (cold start / omp busy) — degrade to the remaining sources.
    return [];
  }
}

/**
 * Build a disabled-native ProviderItem for a provider the omp agent reports as
 * disabled (config.yml disabledProviders). The UI treats these as
 * "disconnected" — re-enabling via POST { enableProvider } flips config.yml.
 */
function disabledProviderItem(slug: string): ProviderItem {
  return {
    id: `omp-disabled-${slug}`,
    name: slug,
    slug,
    icon: 'plug',
    status: 'disconnected',
    disabled: true,
    configuredIn: 'omp disabledProviders',
    models: [],
  };
}

/**
 * Native provider entry discovered from models.yml. Credentials never leave
 * omp's own stores — chamber only surfaces registration info.
 */
function nativeProviderItem(
  slug: string,
  baseUrl: string | undefined,
  nativeModels: Array<{
    id: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoning?: boolean;
    imageInput?: boolean;
  }>,
  isDisabled = false,
): ProviderItem {
  const models = nativeModels.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    contextWindow: model.contextWindow
      ? `${formatContextWindow(model.contextWindow) || Math.round(model.contextWindow / 1000)} ctx`
      : '',
    hasTools: true,
    hasVision: model.imageInput === true,
    hasReasoning: model.reasoning,
    isVisible: true,
    maxTokens: model.maxTokens,
  }));
  return {
    id: `omp-native-${slug}`,
    name: slug,
    slug,
    icon: 'plug',
    status: isDisabled ? 'disconnected' : 'connected',
    disabled: isDisabled,
    configuredIn: baseUrl ? `models.yml · ${baseUrl}` : 'models.yml',
    models: removeLegacyKenariModels({ name: slug, slug, baseUrl }, models),
  };
}

function providerIdentityKey(provider: ProviderItem): string {
  const slug = provider.slug.trim().toLowerCase();
  const name = provider.name.trim().toLowerCase();
  const baseUrl = provider.baseUrl?.trim().toLowerCase() || '';
  if (isKenariProvider({ name, slug, baseUrl })) return 'kenari';
  return slug;
}

function mergeProviderItems(existing: ProviderItem, incoming: ProviderItem): ProviderItem {
  const primary = existing.id.startsWith('omp-auth-') || !incoming.id.startsWith('omp-auth-')
    ? existing
    : incoming;
  const secondary = primary === existing ? incoming : existing;
  const knownModelIds = new Set<string>();
  const models = [...primary.models, ...secondary.models].filter((model) => {
    if (knownModelIds.has(model.id)) return false;
    knownModelIds.add(model.id);
    return true;
  });
  // Disable is a union, not a winner-takes-all: the two sources see different
  // halves of config.yml (auth sees login providers, native sees models.yml), so
  // a flag set on either side must survive the merge — otherwise the provider
  // re-enters the chat picker on the next reload.
  const disabled = primary.disabled === true || secondary.disabled === true;

  return {
    ...primary,
    name: primary.name === primary.slug && secondary.name !== secondary.slug
      ? secondary.name
      : primary.name,
    status: disabled
      ? 'disconnected'
      : primary.status === 'connected' || secondary.status === 'connected'
        ? 'connected'
        : primary.status,
    disabled,
    baseUrl: primary.baseUrl || secondary.baseUrl,
    apiKey: primary.apiKey || secondary.apiKey,
    configuredIn: primary.apiKey || primary.baseUrl ? primary.configuredIn : secondary.configuredIn,
    models,
  };
}

export function deduplicateProviderItems(items: ProviderItem[]): ProviderItem[] {
  const bySlug = new Map<string, ProviderItem>();
  for (const item of items) {
    const normalizedItem = {
      ...item,
      models: removeLegacyKenariModels(item, item.models),
    };
    const key = providerIdentityKey(normalizedItem);
    const existing = bySlug.get(key);
    bySlug.set(key, existing ? mergeProviderItems(existing, normalizedItem) : normalizedItem);
  }
  return [...bySlug.values()];
}

/**
 * Re-apply the chamber-local overlay onto freshly built registry entries. The
 * registry is authoritative for which providers/models exist, but the user's
 * own per-model choices (visibility, sampling config) exist only in SQLite —
 * without this, every reload rebuilds the list with isVisible: true and the
 * eye toggles silently reset.
 *
 * `disabled` is deliberately NOT pulled from the overlay: it is native state
 * (config.yml disabledProviders), and letting a stale SQLite row clear it would
 * put a provider the user disabled back into the chat picker.
 */
function applyStoredOverrides(registry: ProviderItem[], stored: ProviderItem[]): ProviderItem[] {
  if (stored.length === 0) return registry;
  const storedBySlug = new Map(stored.map((provider) => [provider.slug.trim().toLowerCase(), provider]));
  return registry.map((provider) => {
    const saved = storedBySlug.get(provider.slug.trim().toLowerCase());
    if (!saved) return provider;
    const savedModels = new Map(saved.models.map((model) => [model.id, model]));
    return {
      ...provider,
      models: provider.models.map((model) => {
        const previous = savedModels.get(model.id);
        if (!previous) return model;
        return {
          ...model,
          isVisible: previous.isVisible !== false,
          ...(previous.temperature !== undefined ? { temperature: previous.temperature } : {}),
          ...(previous.maxTokens !== undefined ? { maxTokens: previous.maxTokens } : {}),
          ...(previous.topP !== undefined ? { topP: previous.topP } : {}),
          ...(previous.reasoningEffort !== undefined ? { reasoningEffort: previous.reasoningEffort } : {}),
        };
      }),
    };
  });
}

/** Merge all three omp provider sources with app-local custom SQLite entries. */
export async function mergeProviders(custom: ProviderItem[]): Promise<{ providers: ProviderItem[]; modelsConfigPath: string }> {
  const disabled = await readDisabledProviders().catch(() => new Set<string>());
  const authItems = await loadRpcProviderItems();
  const native = await readNativeProviders();
  const nativeItems = native.map((info) => nativeProviderItem(
    info.slug,
    info.baseUrl,
    info.models,
    disabled.has(info.slug),
  ));
  const disabledItems = [...disabled]
    .filter((slug) => !nativeItems.some((n) => n.slug === slug) && !authItems.some((a) => a.slug === slug))
    .map(disabledProviderItem);
  const registryItems = applyStoredOverrides(
    deduplicateProviderItems([...authItems, ...nativeItems, ...disabledItems]),
    custom,
  );
  const nativeSlugs = new Set(registryItems.map((provider) => provider.slug.toLowerCase()));
  return {
    providers: deduplicateProviderItems([
      ...registryItems,
      ...custom.filter((p) => !nativeSlugs.has(p.slug.toLowerCase())),
    ]),
    modelsConfigPath: await getModelsConfigPath(),
  };
}
