import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_PROVIDERS_LIST, PRESET_NEW_PROVIDERS } from '@/data/settings/provider';
import { isMockMode } from '@/mock.server';
import type { ProviderItem } from '@/types';

const SETTINGS_KEY = 'omp_providers_config';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let providers: ProviderItem[] = mock ? DEFAULT_PROVIDERS_LIST : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          providers = parsed;
        }
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_PROVIDERS_LIST),
      ]);
    }

    return json({
      providers,
      presetProviders: PRESET_NEW_PROVIDERS,
      isMock: mock,
    });
  } catch (error: any) {
    const mock = isMockMode();
    return json({
      error: error.message,
      providers: mock ? DEFAULT_PROVIDERS_LIST : [],
      presetProviders: PRESET_NEW_PROVIDERS,
      isMock: mock,
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
      let list: ProviderItem[] = DEFAULT_PROVIDERS_LIST;
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(p => p.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, providers: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      let updatedProviders: ProviderItem[] = [];

      if (Array.isArray(body)) {
        updatedProviders = body;
      } else if (Array.isArray(body.providers)) {
        updatedProviders = body.providers;
      } else if (body.provider) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: ProviderItem[] = DEFAULT_PROVIDERS_LIST;
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(p => p.id === body.provider.id);
        if (idx >= 0) {
          list[idx] = body.provider;
        } else {
          list.push(body.provider);
        }
        updatedProviders = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedProviders),
      ]);

      return json({ success: true, providers: updatedProviders });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
