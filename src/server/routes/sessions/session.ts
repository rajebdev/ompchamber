import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { markStreamSeen } from '@/shared/lib/omp/session/stream-state.server';
import { isMockMode } from '@/server/mock.server';
import { getRpcSession } from '@/server/lib/omp/rpc/manager';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { resolveSessionFileOr404 } from '@/server/lib/omp/session/locator';
import { setSessionTitle } from '@/server/lib/omp/session/title-slot';
import { renameSessionWithAi } from '@/server/lib/omp/session/rename-with-ai.server';
import { isSinglePathSegment } from '@/server/lib/fs/path-segment';
import { loadPersistedModes } from '@/server/lib/omp/session/modes';

/**
 * GET /api/sessions/:sessionId/modes — the plan/goal mode selection persisted
 * in the session's own transcript.
 *
 * Read from the JSONL rather than from `session_ui_state`, because the modes
 * are not a layout preference: they are state the AGENT ran under, and the
 * records are written by the child process as it transitions. That makes this
 * the one source a second tab, a restarted chamber and a CLI-driven session all
 * agree on.
 *
 * A session with no file (a `new-…` chat that has never run) answers the empty
 * selection; a session id the chamber cannot resolve answers 404 like every
 * other session route.
 */
export async function getSessionModes({ params }: LoaderFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) return json({ error: 'Missing session id' }, { status: 400 });
  if (!isSinglePathSegment(sessionId)) return json({ error: 'Session not found' }, { status: 404 });

  const resolved = await resolveSessionFileOr404(sessionId);
  if ('response' in resolved) return resolved.response;
  const modes = await loadPersistedModes(resolved.filePath);
  return json({ sessionId, modes });
}

/**
 * POST /api/sessions/:sessionId/archive — toggle archive state for a session.
 *
 * Archive state is stored in the `archived_sessions` table keyed by the
 * session id (numeric SQLite id in mock mode, omp session UUID string in
 * real mode). The session row itself is never touched, so un-archiving is
 * always possible and no data is lost.
 */
export async function archiveSession({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
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

const MAX_SESSION_NAME_LENGTH = 200;

/**
 * POST /api/sessions/:sessionId/rename — persist a new display name.
 *
 * Real mode: a live omp process owns its session file, so the rename is
 * forwarded over RPC when one is running (and falls back to the on-disk
 * 256-byte title slot when it is not). Mock mode: the title lives in the
 * SQLite `sessions` row (sidebar) and `chat_sessions` row (chat header).
 */
export async function renameSession({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
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

    const resolved = await resolveSessionFileOr404(sessionId);
    if ('response' in resolved) return resolved.response;
    const { filePath } = resolved;

    await setSessionTitle(filePath, name, 'user');
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

/**
 * POST /api/sessions/:sessionId/rename-with-ai — let omp name the session from
 * its own transcript ("Rename with AI" in the session row's menu).
 *
 * Unlike the automatic titling the chamber already does, this is an explicit
 * request, so it renames a session that already has a name.
 */
export async function renameWithAi({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }

  const sessionId = params.sessionId;
  if (!sessionId) return json({ error: 'Missing session id' }, { status: 400 });
  // A pending `new-…` chat has no transcript anywhere, and omp has nothing to
  // derive a title from. The menu omits the item; this is the backstop.
  if (sessionId.startsWith('new-')) {
    return json({ error: 'This chat has not been created yet.', code: 'session_pending' }, { status: 400 });
  }
  if (!isSinglePathSegment(sessionId)) {
    return json({ error: 'Invalid session id' }, { status: 400 });
  }

  const result = await renameSessionWithAi(sessionId);
  if (!result.ok) return json({ error: result.error }, { status: result.status });

  // The rename is a fixed-width in-place slot write, which the scan cache's
  // mtime key cannot see — the same reason the auto-title path clears it.
  return json({ success: true, sessionId, name: result.title });
}

/**
 * GET /api/sessions/:sessionId/state — load the persisted per-session UI
 * state blob. Keyed by the session id (numeric in mock mode, omp session
 * UUID string in real mode), same keying as `archived_sessions`.
 */
export async function getSessionState({ params }: LoaderFunctionArgs) {
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
export async function putSessionState({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
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

/**
 * POST /api/sessions/:sessionId/stream-seen — acknowledge the session's
 * one-shot stream badge (`finish` / `abort`). Called when the
 * session is opened; deletes the terminal row so the check shows exactly
 * once. A `stream` row (live run) is never deleted — a client acking from a
 * stale status map must not kill the spinner of a running session.
 */
export async function markSeen({ params }: ActionFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }
  const deleted = await markStreamSeen(sessionId);
  return json({ success: true, sessionId, deleted });
}
