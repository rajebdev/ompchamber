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
 * A row also carries the MODEL serving that run (`model_provider` + `model_id`),
 * written by the dispatcher that owns the `stream` row and updated only when the
 * writer actually knows the model — so the generating indicator names the real
 * provider/model from the same loader that already carries the status, in every
 * tab and every chamber instance, with no per-session JSONL read.
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

/** The model a session's run is served by, as the generating indicator names it. */
export interface SessionRunModel {
  provider: string;
  modelId: string;
}

/** A session's stream row: its status plus the model that serves that run. */
export interface SessionStreamState {
  status: SessionStreamStatus;
  model?: SessionRunModel;
}

/**
 * Upsert a session's stream row.
 *
 * `model` is written only when the caller actually knows it (prompt dispatch,
 * where the wrapper has reconciled `get_state`/`set_model`); every other write —
 * `agent_start`, a terminal badge, the heal pass — passes nothing and the
 * COALESCE keeps the stored pair, so a status flip cannot blank the model the
 * indicator is reading from the same row.
 */
export async function markStreamStatus(
  sessionId: string,
  status: SessionStreamStatus,
  model?: SessionRunModel | null,
): Promise<void> {
  try {
    const db = await getDb();
    // The owner describes the process running a live row; a terminal badge
    // belongs to no process, and leaving a pid on it would invite a later read
    // to judge the badge by the liveness of a process it never concerned.
    const ownerPid = status === 'stream' ? process.pid : null;
    await db.run(
      `INSERT INTO session_stream_state (session_id, status, owner_pid, model_provider, model_id, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_id) DO UPDATE SET
         status = excluded.status,
         owner_pid = excluded.owner_pid,
         model_provider = COALESCE(excluded.model_provider, session_stream_state.model_provider),
         model_id = COALESCE(excluded.model_id, session_stream_state.model_id),
         updated_at = excluded.updated_at`,
      [sessionId, status, ownerPid, model?.provider ?? null, model?.modelId ?? null],
    );
  } catch {
    // Status tracking is best-effort by design.
  }
}

/**
 * Rename the model a LIVE stream row carries, leaving its status and owner
 * alone.
 *
 * omp's `model_changed` frame carries no payload, so the wrapper re-reads
 * `get_state` and lands here: a retry under a fallback chain
 * (`retry.fallbackChains`) switches the model MID-RUN, and the row the sidebar
 * and the generating indicator name the run by would otherwise keep the
 * pre-fallback model for the rest of the turn.
 *
 * Live-only, deliberately: `markStreamStatus(id, 'stream', model)` upserts a
 * `stream` row, which would RESURRECT a spinner for a run that already ended
 * (a fallback landing on the run's last frame). This can only ever rename a row
 * that still means "a run is in flight".
 */
export async function markStreamModel(sessionId: string, model: SessionRunModel): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `UPDATE session_stream_state
         SET model_provider = ?, model_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND status = 'stream'`,
      [model.provider, model.modelId, sessionId],
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

/** Every stream row keyed by session id — the sidebar loader's single read. */
export async function loadStreamStates(): Promise<Record<string, SessionStreamState>> {
  try {
    const db = await getDb();
    const rows = (await db.all('SELECT session_id, status, model_provider, model_id FROM session_stream_state')) as {
      session_id: string;
      status: string;
      model_provider: string | null;
      model_id: string | null;
    }[];
    const map: Record<string, SessionStreamState> = {};
    for (const row of rows) {
      if (row.status !== 'stream' && row.status !== 'finish' && row.status !== 'abort') continue;
      map[row.session_id] = {
        status: row.status,
        ...(row.model_provider && row.model_id
          ? { model: { provider: row.model_provider, modelId: row.model_id } }
          : {}),
      };
    }
    return map;
  } catch {
    return {};
  }
}

/** Statuses only — for callers (the frame fold's end check) that read no model. */
export async function loadStreamStatuses(): Promise<Record<string, SessionStreamStatus>> {
  const states = await loadStreamStates();
  const map: Record<string, SessionStreamStatus> = {};
  for (const [id, state] of Object.entries(states)) map[id] = state.status;
  return map;
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
 * Whether a `prompt_result` frame proves the dispatched prompt opened no turn,
 * so the live `stream` row written at dispatch must be released.
 *
 * The PROMPT ACK does not carry `agentInvoked`; this frame does, and it arrives
 * after it. Two senders reach it, and the dispatch can only catch the first:
 *
 *   - a builtin (`/usage`, `/compact`) answers the ack itself with
 *     `agentInvoked:false`, and the dispatcher clears the row there;
 *   - the chamber's OWN extension (`/chamber-mode plan on` — the composer's
 *     Plan/Goal toggles) acks a bare `{success:true}` and reports
 *     `agentInvoked:false` on THIS frame instead. Verified against the real
 *     child: the dispatcher read that bare ack as a run, armed the
 *     awaiting-agent-start deadline, and left the row `stream` forever.
 *
 * `agentInvoked === false` is required rather than `!== true`: a frame that
 * omits the field (an older omp, or omp's own trailing `prompt_result` for a
 * real run, which carries `true`) must never be read as "no turn".
 *
 * `streaming` is the same guard the dispatcher's own release uses, and it is
 * load-bearing: a `/chamber-mode` sent while a turn runs is answered in ~20 ms
 * from omp's command loop with the turn still streaming, so without it this
 * would delete THAT turn's live row and blank a spinner that is working.
 *
 * The row is owned by a LIVE process either way, so `healStaleStreamStatuses`
 * can never reach it — this frame is the only thing that can release it.
 */
export function releasesStreamRowOnPromptResult(
  event: Record<string, unknown>,
  host: { streaming: boolean; sessionId: string },
): boolean {
  return event.agentInvoked === false && !host.streaming && Boolean(host.sessionId);
}

/**
 * Whether a `stream` row is an ORPHAN: owned by the reading process, which
 * holds no live run for it.
 *
 * This is the half of the heal that only the owning process can answer. The
 * row's owner is ALIVE (so {@link isStaleStreamRow} can never reach it) and no
 * other instance can see this process's runtime registry — without this rule
 * the row is unreleasable and the spinner turns until the process restarts.
 * Measured: a dropped prompt leaves exactly this shape.
 *
 * `liveRunIds` OMITTED means "release nothing", deliberately: a caller that
 * cannot answer "what am I running?" must never guess, and an EMPTY set is the
 * claim "I run nothing", which would release every row this process owns.
 */
export function isOrphanStreamRow(
  row: { session_id: string; owner_pid: number | null },
  readerPid: number,
  liveRunIds: Set<string> | undefined,
): boolean {
  if (liveRunIds === undefined) return false;
  return row.owner_pid === readerPid && !liveRunIds.has(row.session_id);
}

/**
 * Self-heal, in two directions. Both leave the row at `finish`, which is the
 * honest outcome: the run is not going to finish.
 *
 *  1. A `stream` row whose OWNER IS GONE — a chamber process that exited
 *     mid-run (crash, restart, SIGKILL). Nothing will ever write the terminal
 *     status for it. This half is judged from the row alone (`owner_pid` against
 *     OS liveness), so every instance reading the shared database reaches the
 *     same verdict, and it takes no caller context.
 *
 *  2. A `stream` row THIS PROCESS OWNS while holding no live run for it — the
 *     orphan. The owner is alive, so half (1) can never reach it, and no other
 *     instance can see it either: only the owning process knows whether it
 *     still has a run for the session. This is the shape a dropped prompt
 *     leaves behind (omp accepts the prompt and opens no turn, so no
 *     `agent_end` ever arrives — measured with the chamber's own
 *     `/chamber-mode` extension, whose bare `{success:true}` ack read as a
 *     run), and without this half the spinner turns until the process restarts.
 *
 * `liveRunIds` is what the caller knows and this module cannot: the sessions
 * its process is running right now (`getLiveRunSessionIds`). OMITTED means
 * "release nothing" — deliberately the default, so a caller that cannot answer
 * the question never guesses. Half (2) is skipped entirely rather than assumed
 * empty, because an empty set is the claim "this process runs nothing", which
 * would release every row the process owns.
 *
 * Runs on the sidebar loader's path, so the authoritative status travels with
 * the same fetch that refreshes the list.
 */
export async function healStaleStreamStatuses(liveRunIds?: Set<string>): Promise<void> {
  try {
    const db = await getDb();
    const rows = (await db.all("SELECT session_id, owner_pid FROM session_stream_state WHERE status = 'stream'")) as {
      session_id: string;
      owner_pid: number | null;
    }[];
    const released = new Set<string>();
    for (const row of rows) {
      if (isStaleStreamRow(row, isProcessAlive) || isOrphanStreamRow(row, process.pid, liveRunIds)) {
        released.add(row.session_id);
      }
    }
    if (released.size === 0) return;
    // `status = 'stream'` is re-checked in the WHERE clause: a run that started
    // between the read above and this write owns its row now, and healing it
    // would clear the spinner of a session that is demonstrably working.
    const ids = [...released];
    const placeholders = ids.map(() => '?').join(', ');
    await db.run(
      `UPDATE session_stream_state SET status = 'finish', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'stream' AND session_id IN (${placeholders})`,
      ids,
    );
  } catch {
    // Best-effort.
  }
}
