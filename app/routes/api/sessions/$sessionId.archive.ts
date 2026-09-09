import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

/**
 * POST /api/sessions/:sessionId/archive — toggle archive state for a session.
 *
 * Archive state is stored in the `archived_sessions` table keyed by the
 * session id (numeric SQLite id in mock mode, omp session UUID string in
 * real mode). The session row itself is never touched, so un-archiving is
 * always possible and no data is lost.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const db = await getDb();
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }

  const formData = await request.formData();
  const archived = formData.get('archived') === 'true';

  if (archived) {
    await db.run(
      'INSERT OR IGNORE INTO archived_sessions (session_id) VALUES (?)',
      [sessionId],
    );
  } else {
    await db.run('DELETE FROM archived_sessions WHERE session_id = ?', [sessionId]);
  }

  return json({ success: true, sessionId, archived });
}
