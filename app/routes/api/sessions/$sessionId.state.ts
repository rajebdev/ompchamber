import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

/**
 * GET /api/sessions/:sessionId/state — load the persisted per-session UI
 * state blob. Keyed by the session id (numeric in mock mode, omp session
 * UUID string in real mode), same keying as `archived_sessions`.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }

  const db = await getDb();
  const row = await db.get(
    'SELECT state FROM session_ui_state WHERE session_id = ?',
    [sessionId],
  );

  let state: Record<string, unknown> = {};
  if (row && typeof row.state === 'string' && row.state) {
    try {
      const parsed = JSON.parse(row.state);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        state = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt blob — treat as empty state so the session still opens.
    }
  }

  return json({ sessionId, state });
}

/**
 * POST /api/sessions/:sessionId/state — persist the per-session UI state
 * blob. The body is `{ state: <arbitrary JSON object> }`; the client sends
 * its full state map so the endpoint stays a dumb key/value store.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }

  const body = (await request.json()) as { state?: unknown };
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.state !== 'object' || body.state === null || Array.isArray(body.state)) {
    return json({ error: 'Invalid body: expected { state: object }' }, { status: 400 });
  }

  const db = await getDb();
  await db.run(
    `INSERT OR REPLACE INTO session_ui_state (session_id, state, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [sessionId, JSON.stringify(body.state)],
  );

  return json({ success: true, sessionId });
}
