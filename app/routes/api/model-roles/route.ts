import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { readModelRoles, writeModelRoles } from '@/lib/omp/model-roles';

export async function loader(_args: LoaderFunctionArgs) {
  try {
    return json(readModelRoles());
  } catch (error) {
    return json({ error: String(error) }, { status: 400 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const body = await request.json() as { roles?: unknown };
    if (!body.roles || typeof body.roles !== 'object' || Array.isArray(body.roles)) {
      return json({ error: 'roles must be an object' }, { status: 400 });
    }
    const roles = Object.fromEntries(Object.entries(body.roles).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[0].trim().length > 0 && entry[1].trim().length > 0,
    ));
    writeModelRoles(roles);
    return json({ success: true, roles });
  } catch (error) {
    return json({ error: String(error) }, { status: 400 });
  }
}
