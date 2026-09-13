import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { INITIAL_MODELS_CATALOG } from '@/data/models/catalog';
import { isMockMode } from '@/mock.server';
import type { AIModelOption, ModelsData, ModelEntry } from '@/types';
import { runUtilityCommand, type OmpModel } from '@/lib/omp/rpc/utility';
import { readDisabledProviders } from '@/lib/omp/config/roles';

const MODELS_CATALOG_KEY = 'omp_models_catalog';
const SELECTED_MODEL_KEY = 'omp_selected_model';

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberModelsCache: { data: ModelsData; expiresAt: number } | undefined;
}
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

  const nameMap: Record<string, string> = {};
  const thinkingLevels: Record<string, string[]> = {};
  const modelList: ModelEntry[] = available
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
  const disabledProviders = readDisabledProviders();
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
  globalThis.__ompChamberModelsCache = undefined;
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
    const row = await db.get<{ value?: string }>('SELECT value FROM app_settings WHERE key = ?', [SELECTED_MODEL_KEY]);
    if (!row?.value) return null;
    const selected = readSelectedModelRef(JSON.parse(row.value));
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
      const catalogRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [MODELS_CATALOG_KEY]);
      let models: AIModelOption[] = INITIAL_MODELS_CATALOG;
      if (catalogRow && catalogRow.value) {
        try {
          const parsed = JSON.parse(catalogRow.value);
          if (Array.isArray(parsed) && parsed.length > 0) models = parsed;
        } catch {}
      }
      const selectedRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [SELECTED_MODEL_KEY]);
      let selectedModel: AIModelOption = models[5] || models[0];
      if (selectedRow && selectedRow.value) {
        try {
          const parsed = JSON.parse(selectedRow.value);
          if (parsed && parsed.id) {
            const match = models.find(m => m.id === parsed.id);
            selectedModel = match || parsed;
          }
        } catch {}
      }
      return json({ models, selectedModel, isMock: mock });
    } catch (error: any) {
      return json({
        error: error.message,
        models: INITIAL_MODELS_CATALOG,
        selectedModel: INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0],
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

    const catalogRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [MODELS_CATALOG_KEY]);
    let models: AIModelOption[] = INITIAL_MODELS_CATALOG;
    if (catalogRow?.value) {
      try {
        const parsed = JSON.parse(catalogRow.value);
        if (Array.isArray(parsed)) models = parsed;
      } catch {}
    }

    const { actionType, modelId, thinkingLevel, model, models: newModels } = body;

    if (actionType === 'toggleFavorite' && modelId) {
      models = models.map(m => m.id === modelId ? { ...m, isFavorite: !m.isFavorite } : m);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(models),
      ]);
      return json({ success: true, models });
    }

    if (actionType === 'setThinking' && modelId && thinkingLevel) {
      models = models.map(m => m.id === modelId ? { ...m, thinkingLevel } : m);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(models),
      ]);
      return json({ success: true, models });
    }

    if (actionType === 'toggleCmd' && modelId) {
      models = models.map(m => m.id === modelId ? { ...m, isCmdAgent: !m.isCmdAgent } : m);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(models),
      ]);
      return json({ success: true, models });
    }

    if (actionType === 'selectModel' && model) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SELECTED_MODEL_KEY,
        JSON.stringify(model),
      ]);
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
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(models),
      ]);
      return json({ success: true, models });
    }

    if (actionType === 'saveAll' && Array.isArray(newModels)) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(newModels),
      ]);
      return json({ success: true, models: newModels });
    }

    return json({ error: 'Invalid action or parameters' }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
