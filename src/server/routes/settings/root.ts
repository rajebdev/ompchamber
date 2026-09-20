import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { isMockMode } from '@/server/mock.server';
import { readAllSettingsJson, writeSettingsJson, writeSettingsRaw } from '@/server/lib/db/settings-store';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const settings = await readAllSettingsJson(db);
    return json({ settings, isMock: isMockMode() });
  } catch (error: any) {
    return json({ error: error.message, settings: {}, isMock: isMockMode() }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }

  try {
    const data = await request.json();
    const db = await getDb();

    // Data should be an object of key-value pairs
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object') {
        await writeSettingsJson(db, key, value);
      } else {
        await writeSettingsRaw(db, key, String(value));
      }
    }

    return json({ success: true });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
