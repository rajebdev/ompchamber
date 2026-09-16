import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { isApprovalMode } from '@/lib/omp/config/access-mode';
import type { QueuedMessage, QueuedMessageModel } from '@/types/chat';

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
export async function loader({ params }: LoaderFunctionArgs) {
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
export async function action({ request, params }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'Session ID is required' }, { status: 400 });
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, { status: 405 });
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

  await db.run('BEGIN');
  try {
    await db.run('DELETE FROM queued_messages WHERE session_id = ?', [sessionId]);
    for (const item of items) {
      await db.run(
        `INSERT INTO queued_messages (id, session_id, position, message, attachments, provider, model_id, thinking_level, access_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          sessionId,
          item.position,
          item.text,
          item.attachments,
          item.model?.provider ?? null,
          item.model?.modelId ?? null,
          item.model?.thinkingLevel ?? null,
          item.model?.accessMode ?? null,
        ],
      );
    }
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }

  return json({ success: true });
}
