import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { INITIAL_MODELS_CATALOG } from '@/data/modelCatalogData';
import { isMockMode } from '@/mock.server';
import type { AIModelOption } from '@/types';

const MODELS_CATALOG_KEY = 'omp_models_catalog';
const SELECTED_MODEL_KEY = 'omp_selected_model';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const mock = isMockMode();

    // Fetch catalog
    const catalogRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [MODELS_CATALOG_KEY]);
    let models: AIModelOption[] = INITIAL_MODELS_CATALOG;

    if (catalogRow && catalogRow.value) {
      try {
        const parsed = JSON.parse(catalogRow.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          models = parsed;
        }
      } catch {}
    } else {
      // Seed initial catalog
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MODELS_CATALOG_KEY,
        JSON.stringify(INITIAL_MODELS_CATALOG),
      ]);
    }

    // Fetch selected model
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

    return json({
      models,
      selectedModel,
      isMock: mock,
    });
  } catch (error: any) {
    return json({
      error: error.message,
      models: INITIAL_MODELS_CATALOG,
      selectedModel: INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0],
      isMock: isMockMode(),
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();
    const body = await request.json();

    // 1. Fetch current catalog
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
