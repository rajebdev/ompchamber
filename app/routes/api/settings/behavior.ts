import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_BEHAVIOR_RULES } from '@/data/settings/behavior';
import { isMockMode } from '@/mock.server';

const SETTINGS_KEY = 'omp_behavior_rules';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    const defaultRules = mock ? DEFAULT_BEHAVIOR_RULES : '';
    const rules = row && row.value !== undefined ? row.value : defaultRules;

    if (!row && mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        DEFAULT_BEHAVIOR_RULES,
      ]);
    }

    return json({ rules, isMock: mock });
  } catch (error: any) {
    const mock = isMockMode();
    return json({ error: error.message, rules: mock ? DEFAULT_BEHAVIOR_RULES : '', isMock: mock }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();

      if (body.action === 'reset') {
        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
          SETTINGS_KEY,
          DEFAULT_BEHAVIOR_RULES,
        ]);
        return json({ success: true, rules: DEFAULT_BEHAVIOR_RULES });
      }

      const content = typeof body.rules === 'string' ? body.rules : (typeof body.content === 'string' ? body.content : DEFAULT_BEHAVIOR_RULES);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        content,
      ]);

      return json({ success: true, rules: content });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
