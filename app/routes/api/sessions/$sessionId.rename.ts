import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';
import { getRpcSession } from '@/lib/omp/rpc/manager';
import { clearSessionFileCaches } from '@/lib/omp/session/files';
import { findSessionFileById } from '@/lib/omp/session/locator';
import { setSessionTitle } from '@/lib/omp/session/title-slot';

const MAX_SESSION_NAME_LENGTH = 200;

/**
 * POST /api/sessions/:sessionId/rename — persist a new display name.
 *
 * Real mode: a live omp process owns its session file, so the rename is
 * forwarded over RPC when one is running (and falls back to the on-disk
 * 256-byte title slot when it is not). Mock mode: the title lives in the
 * SQLite `sessions` row (sidebar) and `chat_sessions` row (chat header).
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const name = String(formData.get('name') ?? '').trim();

    if (!name) {
      return json(
        { error: 'Session name cannot be empty', code: 'session_name_required' },
        { status: 400 },
      );
    }
    if (name.length > MAX_SESSION_NAME_LENGTH) {
      return json(
        { error: 'Session name is too long', code: 'session_name_too_long' },
        { status: 400 },
      );
    }

    if (isMockMode()) {
      const db = await getDb();
      const result = await db.run('UPDATE sessions SET title = ? WHERE id = ?', [name, sessionId]);
      await db.run(
        'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?',
        [name, sessionId],
      );
      if (!result.changes) {
        return json({ error: 'Session not found' }, { status: 404 });
      }
      return json({ success: true, sessionId, name });
    }

    // A running omp process owns its session file; let omp's own writer win so
    // the in-memory title cannot clobber ours on the next flush.
    const rpc = getRpcSession(sessionId);
    if (rpc?.isAlive()) {
      try {
        await rpc.send({ type: 'set_session_name', name });
        return json({ success: true, sessionId, name });
      } catch {
        // Fall through to the on-disk title slot below.
      }
    }

    const filePath = findSessionFileById(sessionId);
    if (!filePath) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    setSessionTitle(filePath, name, 'user');
    // The mtime-keyed scan cache cannot see an in-place 256-byte slot write.
    clearSessionFileCaches();
    return json({ success: true, sessionId, name });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
