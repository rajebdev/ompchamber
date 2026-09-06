import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  if (request.method === 'POST') {
    const data = await request.json();
    const { queue_list } = data;
    const db = await getDb();
    
    await db.run(
      'UPDATE sessions SET queue_list = ? WHERE id = ?',
      [JSON.stringify(queue_list || []), sessionId]
    );

    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
