import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const db = await getDb();
  const folderId = params.folderId;

  const folder = await db.get('SELECT id, project_path FROM workspace_folders WHERE id = ?', [folderId]);
  if (!folder) {
    return json({ error: 'Workspace not found' }, { status: 404 });
  }

  if (folder.project_path) {
    await db.run(
      'INSERT OR REPLACE INTO deleted_workspaces (project_path) VALUES (?)',
      [folder.project_path],
    );
  }

  const sessionRows = await db.all('SELECT id FROM sessions WHERE folder_id = ?', [folderId]);
  for (const session of sessionRows) {
    await db.run('DELETE FROM files WHERE session_id = ?', [session.id]);
  }
  await db.run('DELETE FROM sessions WHERE folder_id = ?', [folderId]);
  await db.run('DELETE FROM workspace_folders WHERE id = ?', [folderId]);

  return json({ success: true });
}
