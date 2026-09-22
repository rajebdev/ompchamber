import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { withTransaction } from '@/shared/lib/db/transaction.server';
import { isApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { markStreamSeen } from '@/shared/lib/omp/session/stream-state.server';
import { isMockMode } from '@/server/mock.server';
import { getRpcSession } from '@/server/lib/omp/rpc/manager';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { resolveSessionFileOr404 } from '@/server/lib/omp/session/locator';
import { setSessionTitle } from '@/server/lib/omp/session/title-slot';
import type { QueuedMessage, QueuedMessageModel } from '@/shared/types/chat';

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

/**
 * SQLite-backed queue for a session (`queued_messages` table). Rows carry a
 * model snapshot (provider, model_id, thinking_level, access_mode) so the
 * auto-delivery replays the exact settings the item was queued with, instead
 * of whatever the session runs with at delivery time.
 */

interface QueueRow {
  id: string;
  session_id: string;
  position: number;
  message: string;
  attachments: string;
  provider: string | null;
  model_id: string | null;
  thinking_level: string | null;
  access_mode: string | null;
}

function rowToQueuedMessage(row: QueueRow): QueuedMessage {
  let attachments: unknown = [];
  try {
    attachments = JSON.parse(row.attachments);
  } catch {
    attachments = [];
  }
  const model: QueuedMessageModel | null =
    row.provider && row.model_id
      ? {
          provider: row.provider,
          modelId: row.model_id,
          thinkingLevel: row.thinking_level ?? 'auto',
          accessMode: isApprovalMode(row.access_mode) ? row.access_mode : 'always-ask',
        }
      : null;
  return {
    id: row.id,
    text: row.message,
    attachments: Array.isArray(attachments) ? (attachments as QueuedMessage['attachments']) : [],
    model,
  };
}

/** GET — the session's queued follow-ups in delivery order. */
export async function getQueue({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'Session ID is required' }, { status: 400 });

  const db = await getDb();
  const rows = (await db.all(
    'SELECT * FROM queued_messages WHERE session_id = ? ORDER BY position ASC',
    [sessionId],
  )) as QueueRow[];
  return json({ queue: rows.map(rowToQueuedMessage) });
}

interface QueuePayload {
  id?: unknown;
  text?: unknown;
  attachments?: unknown;
  model?: unknown;
}

function normalizeModel(raw: unknown): QueuedMessageModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.provider !== 'string' || typeof m.modelId !== 'string') return null;
  return {
    provider: m.provider,
    modelId: m.modelId,
    thinkingLevel: typeof m.thinkingLevel === 'string' ? m.thinkingLevel : 'auto',
    accessMode: isApprovalMode(m.accessMode) ? m.accessMode : 'always-ask',
  };
}

/**
 * PUT — replace the session's whole queue with the posted list (the client
 * queue panel is the source of truth: reorder, edit, delete all ship the full
 * remaining list back). Ids are preserved so in-flight mirrors and React keys
 * stay stable.
 */
export async function putQueue({ request, params }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'Session ID is required' }, { status: 400 });
  if (request.method !== 'PUT') {
    return methodNotAllowed({ request, params });
  }

  const body = (await request.json().catch(() => null)) as { queue?: unknown } | null;
  if (!body || !Array.isArray(body.queue)) {
    return json({ error: 'Invalid body: expected { queue: QueuedMessage[] }' }, { status: 400 });
  }

  const db = await getDb();
  const items = body.queue
    .filter((raw): raw is QueuePayload => Boolean(raw) && typeof raw === 'object')
    .map((raw, index) => ({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `queue-${Date.now()}-${index}`,
      text: typeof raw.text === 'string' ? raw.text : '',
      attachments: Array.isArray(raw.attachments) ? JSON.stringify(raw.attachments) : '[]',
      model: normalizeModel(raw.model),
      position: index,
    }));

  withTransaction(db, () => {
    db.raw.run('DELETE FROM queued_messages WHERE session_id = ?', [sessionId]);
    const insert = db.raw.query(
      `INSERT INTO queued_messages (id, session_id, position, message, attachments, provider, model_id, thinking_level, access_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of items) {
      insert.run(
        item.id,
        sessionId,
        item.position,
        item.text,
        item.attachments,
        item.model?.provider ?? null,
        item.model?.modelId ?? null,
        item.model?.thinkingLevel ?? null,
        item.model?.accessMode ?? null,
      );
    }
  });

  return json({ success: true });
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
