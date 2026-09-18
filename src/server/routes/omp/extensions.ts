import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { discoverExtensions, setExtensionDisabled } from '@/server/lib/omp/config/extensions';

export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  if (mock) {
    return json({ extensions: [], isMock: true });
  }
  const url = new URL(request.url);
  const cwd = url.searchParams.get('cwd') ?? undefined;
  return json({ extensions: discoverExtensions(cwd), isMock: false });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || typeof body.disabled !== 'boolean') {
      return json({ error: 'id and disabled are required' }, { status: 400 });
    }
    if (isMockMode()) {
      return json({ error: 'Extension toggles are unavailable in mock mode' }, { status: 400 });
    }
    const changed = setExtensionDisabled(body.id, body.disabled);
    return json({ success: true, changed });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
