import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { applyUpdate } from '@/lib/updates/apply';

/**
 * POST /api/updates/apply — body `{ target: 'omp' | 'ompchamber' }`.
 * Unknown targets are a 400; unexpected failures are a 500.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
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
