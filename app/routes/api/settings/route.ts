import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM app_settings');
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return json({ settings, isMock: isMockMode() });
  } catch (error: any) {
    return json({ error: error.message, settings: {}, isMock: isMockMode() }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const data = await request.json();
    const db = await getDb();

    // Data should be an object of key-value pairs
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object') {
        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      } else {
        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, String(value)]);
      }
    }

    return json({ success: true });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
