import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const db = await getDb();
  const fileId = params.fileId;
  const formData = await request.formData();
  
  const isExpanded = formData.get('isExpanded') === 'true' ? 1 : 0;
  
  await db.run('UPDATE files SET is_expanded = ? WHERE id = ?', [isExpanded, fileId]);
  
  return json({ success: true, isExpanded });
}
