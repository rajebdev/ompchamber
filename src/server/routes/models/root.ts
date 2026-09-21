import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';
import { INITIAL_MODELS_CATALOG } from '@/client/data/models/catalog';
import { isMockMode } from '@/server/mock.server';
import type { AIModelOption, ModelEntry, ModelsData, ProviderItem } from '@/shared/types';
import { readSettingsJson, writeSettingsJson } from '@/server/lib/db/settings-store';
import { runUtilityCommand, type OmpModel } from '@/server/lib/omp/rpc/utility';
import { readDisabledProviders } from '@/server/lib/omp/config/roles';
import { invalidateModelsCaches } from '@/shared/lib/models/server-cache';

const MODELS_CATALOG_KEY = 'omp_models_catalog';
const SELECTED_MODEL_KEY = 'omp_selected_model';
const PROVIDERS_CONFIG_KEY = 'omp_providers_config';

const MODELS_CACHE_TTL_MS = 60_000;
const SAFE_MODEL_LOAD_FAILURE_MESSAGE = 'Model list is temporarily unavailable. Check your configuration and try again.';

const modelNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareModelEntries(a: { id: string; name: string; provider: string }, b: { id: string; name: string; provider: string }): number {
  return modelNameCollator.compare(a.name || a.id, b.name || b.id)
    || modelNameCollator.compare(a.provider, b.provider)
    || modelNameCollator.compare(a.id, b.id);
}

// "off" is always a valid selector; the concrete efforts come from the model's
// baked thinking metadata (omp: getSupportedEfforts = reasoning ? efforts : []).
function thinkingLevelsFor(model: OmpModel): string[] {
  if (!model.reasoning) return ['off'];
  return ['off', ...(model.thinking?.efforts ?? [])];
}

function supportsFastMode(model: OmpModel): boolean {
  return model.provider === 'anthropic' || model.provider === 'openai' || model.provider === 'google';
}

/**
 * Disabled providers recorded in the chamber's own provider overlay. Used only
 * by the MOCK path of `/api/models`, which has no config.yml `disabledProviders`
 * to read — real mode gets the same answer natively.
 */
async function readStoredProvidersForModels(): Promise<ProviderItem[]> {
  try {
    const db = await getDb();
    const parsed = await readSettingsJson<unknown>(db, PROVIDERS_CONFIG_KEY, null);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((provider): provider is ProviderItem => (
      typeof provider === 'object' && provider !== null
      && typeof (provider as ProviderItem).slug === 'string'
      && (provider as ProviderItem).disabled === true
    ));
  } catch {
    return [];
  }
}

function hiddenModelKey(provider: string, modelId: string): string {
  return `${provider.trim().toLowerCase()}:${modelId}`;
}

async function readHiddenModelKeys(): Promise<Set<string>> {
  try {
    const db = await getDb();
    const parsed = await readSettingsJson<unknown>(db, PROVIDERS_CONFIG_KEY, null);
    if (!Array.isArray(parsed)) return new Set();
    const hidden = new Set<string>();
    for (const provider of parsed) {
      if (typeof provider?.slug !== 'string' || !Array.isArray(provider.models)) continue;
      for (const model of provider.models) {
        if (typeof model?.id === 'string' && model.isVisible === false) {
          hidden.add(hiddenModelKey(provider.slug, model.id));
        }
      }
    }
    return hidden;
  } catch {
    return new Set();
  }
}

/**
 * A model is offered only when its provider is neither disabled in omp's
 * config.yml (`disabledProviders`) nor carrying a per-model hide in the
 * chamber overlay. Disabling the provider is the coarse switch — Settings →
 * Providers flips it so the whole provider leaves the chat picker.
 */
function filterSelectableModels(
  available: OmpModel[],
  disabledProviders: Set<string>,
  hiddenModelKeys: Set<string>,
): OmpModel[] {
  return available.filter((model) => (
    !disabledProviders.has(model.provider)
    && !hiddenModelKeys.has(hiddenModelKey(model.provider, model.id))
  ));
}

async function loadModels(): Promise<ModelsData> {
  const availableResponse = await runUtilityCommand<{ models?: unknown }>(
    { type: 'get_available_models' },
    120_000,
  );
  const available = Array.isArray(availableResponse.models)
    ? availableResponse.models
        .filter((model): model is OmpModel => (
          typeof model === 'object' && model !== null
          && typeof (model as OmpModel).id === 'string'
          && typeof (model as OmpModel).provider === 'string'
        ))
        .map((model) => ({
          ...model,
          name: typeof model.name === 'string' && model.name.trim().length > 0 ? model.name : model.id,
        }))
    : [];

  const disabledProviders = await readDisabledProviders();
  const hiddenModelKeys = await readHiddenModelKeys();
  const nameMap: Record<string, string> = {};
  const thinkingLevels: Record<string, string[]> = {};
  const modelList: ModelEntry[] = filterSelectableModels(available, disabledProviders, hiddenModelKeys)
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      thinkingLevels: thinkingLevelsFor(m),
      supportsFastMode: supportsFastMode(m),
      contextWindow: m.contextWindow ?? undefined,
      maxTokens: m.maxTokens ?? undefined,
      cost: m.cost,
    }))
    .sort(compareModelEntries);

  const loginResponse = await runUtilityCommand<{ providers?: unknown }>(
    { type: 'get_login_providers' },
    30_000,
  );
  const loginProviders = Array.isArray(loginResponse.providers)
    ? loginResponse.providers.filter((provider): provider is { id: string; name: string; authenticated: boolean } => (
      typeof provider === 'object' && provider !== null
      && typeof (provider as { id?: unknown }).id === 'string'
      && typeof (provider as { name?: unknown }).name === 'string'
      && typeof (provider as { authenticated?: unknown }).authenticated === 'boolean'
    ))
    : [];
  const connectedProviders = loginProviders
    .filter((provider) => provider.authenticated)
    .map((provider) => ({ id: provider.id, name: provider.name, disabled: disabledProviders.has(provider.id) }));
  for (const m of available) {
    const key = `${m.provider}:${m.id}`;
    nameMap[key] = m.name;
    thinkingLevels[key] = thinkingLevelsFor(m);
  }

  let defaultModel: { provider: string; modelId: string } | null = null;
  try {
    const state = await runUtilityCommand<{ model?: { provider?: string; id?: string } }>(
      { type: 'get_state' },
      30_000,
    );
    const provider = state.model?.provider;
    const modelId = state.model?.id;
    if (provider && modelId && available.some((m) => m.provider === provider && m.id === modelId)) {
      defaultModel = { provider, modelId };
    }
  } catch {
    // Default model is cosmetic — the models list is still useful without it.
  }

  return { models: nameMap, modelList, defaultModel, thinkingLevels, connectedProviders };
}

const EMPTY_MODELS: ModelsData = {
  models: {},
  modelList: [],
  defaultModel: null,
  thinkingLevels: {},
};

async function loadModelsWithCache(): Promise<ModelsData> {
  const cached = globalThis.__ompChamberModelsCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await loadModels();
  globalThis.__ompChamberModelsCache = { data, expiresAt: Date.now() + MODELS_CACHE_TTL_MS };
  return data;
}

function invalidateModelsCache(): void {
  invalidateModelsCaches();
}

/** Parse a persisted { provider, modelId|id } reference without trusting the JSON shape. */
function readSelectedModelRef(value: unknown): { provider: string; modelId: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { provider?: unknown; modelId?: unknown; id?: unknown };
  if (typeof candidate.provider !== 'string' || candidate.provider.length === 0) return null;
  const modelId = candidate.modelId ?? candidate.id;
  if (typeof modelId !== 'string' || modelId.length === 0) return null;
  return { provider: candidate.provider, modelId };
}

/** The user's persisted pick resolved against the live registry; null when stale or unparseable. */
async function loadPersistedModelOption(modelList: ModelEntry[]): Promise<AIModelOption | null> {
  try {
    const db = await getDb();
    const selected = readSelectedModelRef(await readSettingsJson<unknown>(db, SELECTED_MODEL_KEY, null));
    if (!selected) return null;
    const match = modelList.find(m => m.id === selected.modelId && m.provider === selected.provider);
    if (!match) return null;
    return {
      id: match.id,
      name: match.name,
      provider: match.provider,
      contextWindow: match.contextWindow,
      thinkingLevels: match.thinkingLevels,
      thinkingLevel: match.thinkingLevels?.[0],
    };
  } catch {
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();

  // MOCK mode keeps the SQLite-backed catalog (chamber demo behavior).
  if (mock) {
    try {
      const db = await getDb();
      const catalog = await readSettingsJson<unknown>(db, MODELS_CATALOG_KEY, null);
      const stored: AIModelOption[] = Array.isArray(catalog) && catalog.length > 0 ? catalog : INITIAL_MODELS_CATALOG;
      // Demo mode has no config.yml to read, so the disable flag lives on the
      // stored provider overlay. Filtering here keeps the model picker honest
      // in MOCK=true too — the settings page must be able to prove the switch.
      const disabledSlugs = new Set(
        (await readStoredProvidersForModels()).map((provider) => provider.slug.trim().toLowerCase()),
      );
      const models = stored.filter((model) => !disabledSlugs.has(model.provider.trim().toLowerCase()));
      const persisted = await readSettingsJson<AIModelOption | null>(db, SELECTED_MODEL_KEY, null);
      // Every provider disabled ⇒ empty list and no selection; the composer must
      // see that honestly instead of holding on to a hidden provider's model.
      let selectedModel: AIModelOption | null = models[5] || models[0] || null;
      if (persisted && persisted.id && persisted.provider) {
        const match = models.find(m => m.id === persisted.id && m.provider === persisted.provider);
        if (match) selectedModel = match;
      }
      return json({ models, selectedModel, isMock: mock });
    } catch (error: any) {
      return json({
        error: error.message,
        models: INITIAL_MODELS_CATALOG,
        selectedModel: INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0] || null,
        isMock: mock,
      }, { status: 500 });
    }
  }

  // Real mode: read the omp model registry via the shared utility RPC process.
  // The ?cwd= query param is accepted for client compatibility but ignored —
  // the omp model registry (auth + models.yml) is global, not per-cwd.
  void request;
  try {
    const data = await loadModelsWithCache();
    // The selection changes independently of the 60s registry cache.
    return json({ ...data, selectedModel: await loadPersistedModelOption(data.modelList) });
  } catch {
    return json({ ...EMPTY_MODELS, modelError: SAFE_MODEL_LOAD_FAILURE_MESSAGE });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();
    const body = await request.json();

    const catalog = await readSettingsJson<unknown>(db, MODELS_CATALOG_KEY, null);
    // The shipped demo catalog is MOCK-only: a real install starts from an empty
    // list, so a demo model can never be persisted into its stored catalog.
    let models: AIModelOption[] = Array.isArray(catalog)
      ? catalog
      : (isMockMode() ? INITIAL_MODELS_CATALOG : []);

    const { actionType, modelId, provider, thinkingLevel, model, models: newModels } = body;

    // Model-scoped mutations must match provider + id: the registry serves the
    // same model id from several providers, so an id-only match rewrites the
    // first provider's entry instead of the one the user acted on.
    if (actionType === 'toggleFavorite' && modelId && provider) {
      models = models.map(m => m.id === modelId && m.provider === provider ? { ...m, isFavorite: !m.isFavorite } : m);
      await writeSettingsJson(db, MODELS_CATALOG_KEY, models);
      return json({ success: true, models });
    }

    if (actionType === 'setThinking' && modelId && provider && thinkingLevel) {
      models = models.map(m => m.id === modelId && m.provider === provider ? { ...m, thinkingLevel } : m);
      await writeSettingsJson(db, MODELS_CATALOG_KEY, models);
      return json({ success: true, models });
    }

    if (actionType === 'toggleCmd' && modelId && provider) {
      models = models.map(m => m.id === modelId && m.provider === provider ? { ...m, isCmdAgent: !m.isCmdAgent } : m);
      await writeSettingsJson(db, MODELS_CATALOG_KEY, models);
      return json({ success: true, models });
    }

    if (actionType === 'selectModel' && model) {
      await writeSettingsJson(db, SELECTED_MODEL_KEY, model);
      const parsedModel = readSelectedModelRef(model);
      if (parsedModel) {
        invalidateModelsCache();
        // Live set_model against the current session is handled by the agent
        // RPC bridge; here we only persist the selection for session spawn.
      }
      return json({ success: true, selectedModel: model });
    }

    if (actionType === 'addModel' && model) {
      models.push(model);
      await writeSettingsJson(db, MODELS_CATALOG_KEY, models);
      return json({ success: true, models });
    }

    if (actionType === 'saveAll' && Array.isArray(newModels)) {
      await writeSettingsJson(db, MODELS_CATALOG_KEY, newModels);
      return json({ success: true, models: newModels });
    }

    return json({ error: 'Invalid action or parameters' }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
