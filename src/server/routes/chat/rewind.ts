import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { readFileSync, renameSync, writeFileSync } from 'fs';
import { getDb } from '@/server/db.server';
import { findSessionFileById } from '@/server/lib/omp/session/locator';
import { getRpcSession } from '@/server/lib/omp/rpc/session-registry';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { userTurnsRelate } from '@/shared/lib/chat/timeline/turns';

/**
 * In-place rewind (undo) for an omp session: truncate the session JSONL back
 * to just before a user turn and clean the chamber's DB overlay copy.
 *
 * Why file surgery instead of omp's `branch` RPC: branch always forks a new
 * session file (new id → URL/sidebar churn). omp itself rewrites this same
 * file in place for equivalent operations (`rewriteEntries`), and its JSONL
 * readers walk entries in order, so a prefix-preserving truncation is faithful.
 *
 * Safety contract:
 *  - the live omp process for this session is destroyed first (it flushes all
 *    pending state on shutdown and is the only other writer of this file);
 *  - the original file is kept as `<name>.bak-<timestamp>` (omp's session
 *    listing ignores names containing `.bak`, so it never becomes a phantom
 *    session).
 */

interface StoredMessage {
  role?: string;
  content?: string;
  id?: string;
}

/** Extract plain text from omp user-message content (string or text blocks). */
function userEntryText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
      .join('');
  }
  return '';
}

/**
 * Build the truncated body: entries at/after the cut user turn are dropped;
 * header records and everything before it survive. Returns null when the cut
 * entry cannot be found or is not a user message (rewind points are turns).
 */
function truncateJsonl(body: string, cutEntryId: string): string | null {
  const records: Array<Record<string, unknown> | null> = body.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  });

  const cutIndex = records.findIndex((r) => r?.id === cutEntryId);
  if (cutIndex === -1) return null;

  const cutRecord = records[cutIndex];
  const cutRole: unknown = (cutRecord as { message?: { role?: unknown } } | null)?.message?.role;
  if (cutRole !== 'user') return null;

  const outLines = records
    .slice(0, cutIndex)
    .filter((r): r is Record<string, unknown> => Boolean(r))
    .map((r) => JSON.stringify(r));
  // Header records written after the cut point (model/thinking changes during
  // the abandoned turns) still describe the session's latest state — keep the
  // last of each so a respawn resumes with the same model/level.
  for (const type of ['model_change', 'thinking_level_change'] as const) {
    const last = records
      .slice(cutIndex)
      .filter((r): r is Record<string, unknown> => r?.type === type)
      .pop();
    if (last) outLines.push(JSON.stringify(last));
  }
  return `${outLines.join('\n')}\n`;
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 });

  const body: unknown = await request.json().catch(() => null);
  const entryId = body && typeof body === 'object' && 'entryId' in body && typeof body.entryId === 'string'
    ? body.entryId
    : '';
  if (!entryId) return json({ error: 'entryId is required', code: 'entry_id_required' }, { status: 400 });

  const filePath = findSessionFileById(sessionId);
  if (!filePath) return json({ error: 'Session not found' }, { status: 404 });

  // Tear down the live process first: it flushes pending writes on shutdown
  // and must not race the rewrite. Best-effort — the session may already be
  // gone or mid-restart.
  const live = getRpcSession(sessionId);
  if (live?.isAlive()) {
    await live.destroyAndWait();
  }
  clearSessionFileCaches();

  const raw = readFileSync(filePath, 'utf8');
  const nextBody = truncateJsonl(raw, entryId);
  if (nextBody === null) {
    return json({ error: 'Entry not found or not a user turn in this session', code: 'entry_not_found' }, { status: 400 });
  }

  // Backup then rewrite. `.bak` names are skipped by omp's session listing.
  const backupPath = `${filePath}.bak-${Date.now()}`;
  renameSync(filePath, backupPath);
  try {
    writeFileSync(filePath, nextBody, 'utf8');
  } catch (error) {
    renameSync(backupPath, filePath);
    return json({ error: error instanceof Error ? error.message : 'Failed to rewrite session file' }, { status: 500 });
  }

  // Clean the chamber DB overlay: drop stored turns that no longer survive in
  // the truncated JSONL, otherwise mergeOmpAttachments resurrects them.
  try {
    const db = await getDb();
    const row = await db.get('SELECT title, messages FROM chat_sessions WHERE session_id = ?', [sessionId]);
    if (row?.messages) {
      let stored: StoredMessage[] = [];
      try {
        stored = JSON.parse(row.messages) as StoredMessage[];
      } catch {
        stored = [];
      }
      // IDs still present in the truncated file survive verbatim; user turns
      // whose stored text relates to the surviving JSONL chain also stay (the
      // stored copy carries raw composer text, the JSONL the delivered prompt).
      const truncatedIds = new Set(nextBody.split('\n').map((line) => JSON.parse(line).id as string | undefined));
      const keptUserEntries = nextBody
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((r) => r.type === 'message' && (r as { message?: { role?: unknown } }).message?.role === 'user')
        .map((r) => userEntryText((r as { message?: { content?: unknown } }).message?.content));
      const next = stored.filter((m) => {
        if (m?.id && truncatedIds.has(m.id)) return true;
        if (m?.role !== 'user' || typeof m.content !== 'string') return false;
        return keptUserEntries.some((text) => userTurnsRelate(text, m.content!));
      });
      if (next.length !== stored.length) {
        await db.run(
          'INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [sessionId, row.title ?? null, JSON.stringify(next)],
        );
      }
    }
  } catch {
    // Overlay cleanup is best-effort; the JSONL is authoritative for reloads.
  }

  clearSessionFileCaches();
  return json({ success: true });
}
