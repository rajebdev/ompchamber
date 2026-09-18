/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-authoritative per-session stream status, persisted in SQLite so the
 * sidebar can render spinner/check from the SAME loader that already refresh
 * on stream events (`omp:session-updated` → revalidator). Statuses:
 *
 *   stream  — a run is in flight (agent_start)
 *   finish  — the run ended normally (agent_end), not yet seen
 *   abort   — the user stopped it, not yet seen
 *   error   — the run failed (prompt_error / process exit), not yet seen
 *
 * A terminal status is a one-shot badge: opening the session acknowledges it
 * (`markStreamSeen` deletes the row), which is exactly the "check appears
 * once, disappears when the session is opened" contract. Rows marked
 * `stream` whose session is no longer running when the sidebar loads are
 * stale (chamber restart mid-run) and self-heal to `finish`.
 *
 * All writes are fire-and-forget: a status write must never fail a prompt,
 * and the sidebar re-reads on the next revalidate anyway.
 */

import { getDb } from '@/server/db.server';

export type SessionStreamStatus = 'stream' | 'finish' | 'abort' | 'error';

export async function markStreamStatus(sessionId: string, status: SessionStreamStatus): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO session_stream_state (session_id, status, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      [sessionId, status],
    );
  } catch {
    // Status tracking is best-effort by design.
  }
}

/**
 * Opening the session clears its terminal badge (one-shot contract).
 *
 * Terminal-only: a `stream` row is a LIVE run and must never be deleted here.
 * Deleting one used to be possible when a client acked from a stale status
 * map (a `finish` row the sidebar last saw before `agent_start` overwrote it
 * with `stream`) — the spinner vanished while the run kept going. The client
 * `markSeen` path also guards terminal-only, but the server is the source of
 * truth and must hold the line on its own.
 */
export async function markStreamSeen(sessionId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db.run("DELETE FROM session_stream_state WHERE session_id = ? AND status != 'stream'", [sessionId]);
    return (result.changes ?? 0) > 0;
  } catch {
    // Best-effort.
    return false;
  }
}

/** All statuses keyed by session id — the sidebar loader's single read. */
export async function loadStreamStatuses(): Promise<Record<string, SessionStreamStatus>> {
  try {
    const db = await getDb();
    const rows = (await db.all('SELECT session_id, status FROM session_stream_state')) as {
      session_id: string;
      status: string;
    }[];
    const map: Record<string, SessionStreamStatus> = {};
    for (const row of rows) {
      if (row.status === 'stream' || row.status === 'finish' || row.status === 'abort' || row.status === 'error') {
        map[row.session_id] = row.status;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Self-heal: `stream` rows belong to a live chamber process. After a restart
 * mid-run nothing will ever write the terminal status, so at read time a
 * `stream` row with no running session flips to `finish`.
 */
export async function healStaleStreamStatuses(runningIds: Set<string>): Promise<void> {
  try {
    const db = await getDb();
    const rows = (await db.all("SELECT session_id FROM session_stream_state WHERE status = 'stream'")) as {
      session_id: string;
    }[];
    for (const row of rows) {
      if (!runningIds.has(row.session_id)) {
        await db.run("UPDATE session_stream_state SET status = 'finish', updated_at = CURRENT_TIMESTAMP WHERE session_id = ?", [
          row.session_id,
        ]);
      }
    }
  } catch {
    // Best-effort.
  }
}
