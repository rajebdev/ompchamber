import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { deleteWorkspaceFolder, parseFolderSettingsPatch, updateWorkspaceFolder } from '@/shared/lib/workspace/project-settings';

export async function pinFolder({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }

  const db = await getDb();
  const folderId = params.folderId;
  const formData = await request.formData();

  const isPinned = formData.get('isPinned') === 'true' ? 1 : 0;

  await db.run('UPDATE workspace_folders SET is_pinned = ? WHERE id = ?', [isPinned, folderId]);

  return json({ success: true, isPinned });
}

export async function toggleFolder({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }

  const db = await getDb();
  const folderId = params.folderId;
  const formData = await request.formData();

  const isExpanded = formData.get('isExpanded') === 'true' ? 1 : 0;

  await db.run('UPDATE workspace_folders SET is_expanded = ? WHERE id = ?', [isExpanded, folderId]);

  return json({ success: true, isExpanded });
}

export async function deleteFolder({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return methodNotAllowed({ request, params });
  }

  const db = await getDb();
  const folderId = params.folderId;

  const deleted = await deleteWorkspaceFolder(db, folderId || '');
  if (!deleted) return json({ error: 'Workspace not found' }, { status: 404 });

  return json({ success: true });
}

export async function updateFolderSettings({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return methodNotAllowed({ request, params });
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
