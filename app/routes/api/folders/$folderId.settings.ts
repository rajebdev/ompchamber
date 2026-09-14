import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import {
  parseFolderSettingsPatch,
  updateWorkspaceFolder,
} from '@/lib/workspace/project-settings';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const folderId = params.folderId;
  if (!folderId) return json({ error: 'folderId is required' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const db = await getDb();
  const patch = parseFolderSettingsPatch(body);
  const updated = await updateWorkspaceFolder(db, folderId, patch);
  if (!updated) {
    const folder = await db.get('SELECT id FROM workspace_folders WHERE id = ?', [folderId]);
    if (!folder) return json({ error: 'Workspace not found' }, { status: 404 });
    return json({ success: true, changed: false });
  }

  return json({ success: true, changed: true });
}
