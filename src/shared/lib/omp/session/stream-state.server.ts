/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-authoritative per-session stream status, persisted in SQLite so the
 * sidebar can render spinner/check from the SAME loader that already refreshes
 * on stream events (`omp:session-updated` → revalidator). Statuses:
 *
 *   stream  — a run is in flight (prompt dispatch → agent_end)
 *   finish  — the run ended normally (agent_end), not yet seen
 *   abort   — the user stopped it, not yet seen
 *
 * A terminal status is a one-shot badge: opening the session acknowledges it
 * (`markStreamSeen` deletes the row), which is exactly the "check appears
 * once, disappears when the session is opened" contract.
 *
 * `stream` rows record the pid of the chamber process running that session, so
 * a `stream` row whose owner is gone self-heals to `finish` — see
 * `healStaleStreamStatuses`. Ownership travels in the row because the database
 * is SHARED by every chamber instance on the machine (~/.ompchamber/db.sqlite)
 * while the runtime session registry is per process: without the column, a
 * second instance opening its sidebar judged the first instance's live run by
 * its own empty registry and cleared a spinner that was still working.
 *
 * All writes are fire-and-forget: a status write must never fail a prompt,
 * and the sidebar re-reads on the next revalidate anyway.
 */

import { getDb } from '@/server/db.server';
import { isProcessAlive } from '@/server/lib/lifecycle/identity';

export type SessionStreamStatus = 'stream' | 'finish' | 'abort';

export async function markStreamStatus(sessionId: string, status: SessionStreamStatus): Promise<void> {
  try {
    const db = await getDb();
    // The owner describes the process running a live row; a terminal badge
    // belongs to no process, and leaving a pid on it would invite a later read
    // to judge the badge by the liveness of a process it never concerned.
    const ownerPid = status === 'stream' ? process.pid : null;
    await db.run(
      `INSERT INTO session_stream_state (session_id, status, owner_pid, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_id) DO UPDATE SET
         status = excluded.status,
         owner_pid = excluded.owner_pid,
         updated_at = excluded.updated_at`,
      [sessionId, status, ownerPid],
    );
  } catch {
    // Status tracking is best-effort by design.
  }
}

/**
 * Drop an optimistic `stream` row whose prompt never started a turn: the ack
 * reported `agentInvoked: false`, or the dispatch failed before omp accepted
 * it. Live-only — a `stream` row a concurrent `agent_start` wrote is still the
 * truth, and terminal badges are cleared by `markStreamSeen`.
 */
export async function clearStreamStatus(sessionId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.run("DELETE FROM session_stream_state WHERE session_id = ? AND status = 'stream'", [sessionId]);
  } catch {
    // Best-effort.
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
      if (row.status === 'stream' || row.status === 'finish' || row.status === 'abort') {
        map[row.session_id] = row.status;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Whether a `stream` row has no live run behind it and must heal to `finish`.
 *
 * The owner pid is the only input: a row is live exactly while the process that
 * wrote it is still running. EVERY chamber instance therefore reaches the same
 * verdict from the same row — which is the point. Judging a row by the reader's
 * own runtime registry instead made instances disagree about one run: a second
 * instance opening its sidebar saw an empty registry, called the first
 * instance's working run stale, and cleared a spinner that was still turning.
 *
 * A row with no owner predates the column and heals: new code always records a
 * pid for `stream`, so an ownerless `stream` row can only come from an older
 * process, whose run nothing can vouch for.
 */
export function isStaleStreamRow(
  row: { session_id: string; owner_pid: number | null },
  isOwnerAlive: (ownerPid: number) => boolean,
): boolean {
  if (row.owner_pid === null) return true;
  return !isOwnerAlive(row.owner_pid);
}

/**
 * Self-heal: a `stream` row outlives its owner when a chamber process exits
 * mid-run (crash, restart, SIGKILL) — nothing will ever write the terminal
 * status for it. At read time every such row flips to `finish`, which is the
 * honest outcome: the run is not going to finish.
 *
 * Deliberately takes no caller context. Liveness is the same question for every
 * instance, so it is answered once, here, from the OS — the database is shared
 * by all of them and they must all read the same status out of it.
 *
 * Runs on the sidebar loader's path, so the authoritative status travels with
 * the same fetch that refreshes the list.
 */
export async function healStaleStreamStatuses(): Promise<void> {
  try {
    const db = await getDb();
    const rows = (await db.all("SELECT session_id, owner_pid FROM session_stream_state WHERE status = 'stream'")) as {
      session_id: string;
      owner_pid: number | null;
    }[];
    const stale = rows.filter((row) => isStaleStreamRow(row, isProcessAlive)).map((row) => row.session_id);
    if (stale.length === 0) return;
    // `status = 'stream'` is re-checked in the WHERE clause: a run that started
    // between the read above and this write owns its row now, and healing it
    // would clear the spinner of a session that is demonstrably working.
    const placeholders = stale.map(() => '?').join(', ');
    await db.run(
      `UPDATE session_stream_state SET status = 'finish', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'stream' AND session_id IN (${placeholders})`,
      stale,
    );
  } catch {
    // Best-effort.
  }
}
