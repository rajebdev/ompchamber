import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { applyUpdate } from '@/server/lib/updates/apply';

/**
 * POST /api/updates/apply — body `{ target: 'omp' | 'ompchamber' }`.
 * Unknown targets are a 400; unexpected failures are a 500.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }
  try {
    const body = (await request.json()) as { target?: unknown };
    const target = body.target;
    if (target === 'omp' || target === 'ompchamber') {
      return json(await applyUpdate(target));
    }
    return json({ error: 'Unknown update target' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply update';
    return json({ error: message }, { status: 500 });
  }
}
