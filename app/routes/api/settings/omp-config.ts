import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { isMockMode } from '@/mock.server';
import {
  getOmpConfigValue,
  listOmpConfig,
  resetOmpConfigKey,
  setOmpConfigValue,
} from '@/lib/omp/config/config-cli';

export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key) {
      return json({ key, value: (await getOmpConfigValue(key)) ?? null, isMock: mock });
    }
    const entries = await listOmpConfig();
    return json({ entries, isMock: mock });
  } catch (error: any) {
    return json({ error: error.message, entries: {}, isMock: mock }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const body = await request.json();
    if (typeof body.key !== 'string' || !body.key.trim()) {
      return json({ error: 'key is required' }, { status: 400 });
    }
    if (body.action === 'reset') {
      const value = await resetOmpConfigKey(body.key);
      return json({ success: true, key: body.key, value: value ?? null });
    }
    if (!('value' in body) || body.value === null) {
      return json({ error: 'value must be a string, number, boolean, array, or record' }, { status: 400 });
    }
    const valueType = typeof body.value;
    if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean' && !Array.isArray(body.value) && valueType !== 'object') {
      return json({ error: 'value must be a string, number, boolean, array, or record' }, { status: 400 });
    }
    const value = await setOmpConfigValue(body.key, body.value);
    return json({ success: true, key: body.key, value: value ?? null });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
