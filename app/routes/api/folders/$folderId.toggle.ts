import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '~/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const db = await getDb();
  const folderId = params.folderId;
  const formData = await request.formData();
  
  const isExpanded = formData.get('isExpanded') === 'true' ? 1 : 0;
  
  await db.run('UPDATE workspace_folders SET is_expanded = ? WHERE id = ?', [isExpanded, folderId]);
  
  return json({ success: true, isExpanded });
}
