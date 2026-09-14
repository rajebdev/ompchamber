import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { deleteWorkspaceFolder } from '@/lib/workspace/project-settings';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const db = await getDb();
  const folderId = params.folderId;

  const deleted = await deleteWorkspaceFolder(db, folderId || '');
  if (!deleted) return json({ error: 'Workspace not found' }, { status: 404 });

  return json({ success: true });
}
