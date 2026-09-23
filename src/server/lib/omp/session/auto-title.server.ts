/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto session titles for OMPChamber.
 *
 * Chamber spawns omp with `--mode rpc-ui`, and that mode force-sets
 * `PI_NO_TITLE=1` (omp's main.ts). The flag gates only the two AUTOMATIC title
 * paths — `AgentSession.maybeStartTitleGeneration` (first user message) and
 * `#scheduleReplanTitleRefresh` (todo replan) — so a chamber session is never
 * named on its own and the sidebar keeps the `New Session - <timestamp>`
 * placeholder for its whole life.
 *
 * The generate path itself is NOT gated: `/rename` with no args reaches
 * `session.generateTitle()` through `executeAcpBuiltinSlashCommand`, which
 * rpc-mode dispatches for a `prompt` frame before any turn starts. Verified
 * against omp 18.2.10 — the ack returns `{agentInvoked:false}` immediately, the
 * generation lands ~4s later as `session_info_update` + `command_output`, and
 * no entry is written to the transcript.
 *
 * WHY THE NAME MUST BE EMPTY FIRST: `/rename` persists through
 * `setSessionName(title, "user")`. omp's own guard only refuses an `"auto"`
 * write over a `"user"` title, so a `/rename` fired against an already-named
 * session would overwrite the operator's own name. The unnamed check below is
 * therefore the safety property, not a nicety — it is re-read from `get_state`
 * on every attempt rather than cached, so a rename made in another tab is
 * respected.
 *
 * Firing after every settled run (not just the first) mirrors omp: a session
 * whose opening message was a bare greeting stays unnamed, and the next real
 * message titles it. The low-signal filter on omp's side returns no title for
 * such input, so the retry costs one tiny-model call and nothing else.
 */

import { readSettingsJson } from '@/server/lib/db/settings-store';
import { getDb } from '@/server/db.server';
import { GET_STATE_TIMEOUT_MS, PROMPT_ACK_TIMEOUT_MS, type RpcSessionState } from '@/server/lib/omp/rpc/constants';

/** Chamber settings blob key; mirrors `streamTransport` and friends. */
const CHAMBER_SETTINGS_KEY = 'omp_chamber_settings';

/** Auto-titling is opt-in per chamber install. Default ON: an unnamed session
 *  renders as `New Session - <timestamp>` forever, which is the visible defect,
 *  and the cost is one tiny-model call per session. */
const AUTO_SESSION_TITLE_DEFAULT = true;

/** omp's builtin that generates a title from the conversation. Sent with no
 *  args so omp derives it through its own `generateRenameTitle`. */
const GENERATE_TITLE_COMMAND = '/rename';

/**
 * How long the chamber's own `/rename` may keep emitting its diagnostic frames.
 *
 * The command answers on the prompt path with an immediate ack and then streams
 * `session_info_update` + `command_output` once the tiny model returns
 * (measured ~4s). Both carry NO correlation id, so the only way to attribute
 * them to our background request is this window. It is deliberately generous —
 * a slow provider must not leak the message — because the cost of over-holding
 * it is only that a slash command typed in the same few seconds loses its
 * output row.
 */
const AUTO_TITLE_OUTPUT_WINDOW_MS = 60_000;

/** Wrapper state this module reads and writes. The in-flight flag and the
 *  output window are owned by the caller because they are per-session runtime
 *  state, not policy. */
export interface AutoTitleHost {
  sessionId: string;
  autoTitleInFlight: boolean;
  /** Epoch ms until which frames belong to our own background rename; 0 when
   *  no request is outstanding. */
  autoTitleWindowUntil: number;
  proc: {
    sendCommand<T = unknown>(command: { type: string; [key: string]: unknown }, timeoutMs?: number): Promise<T>;
  };
}

/**
 * Claim the frames our own `/rename` is about to emit, so the wrapper can keep
 * its diagnostics out of the timeline. Called once the request is accepted.
 */
export function markTitleRequestSent(host: AutoTitleHost): void {
  host.autoTitleWindowUntil = Date.now() + AUTO_TITLE_OUTPUT_WINDOW_MS;
}

/**
 * True when this frame is the tail of our own background rename, consuming the
 * window. One frame per request: omp emits exactly one `command_output` for it,
 * on both the success and the "could not generate" path.
 */
export function consumeAutoTitleOutput(host: AutoTitleHost): boolean {
  if (host.autoTitleWindowUntil === 0 || Date.now() > host.autoTitleWindowUntil) return false;
  host.autoTitleWindowUntil = 0;
  return true;
}

/**
 * Read the `autoSessionTitle` flag from the chamber settings blob. Absent or
 * malformed → the default. Never throws: a settings read must not be able to
 * break a turn's settle path.
 */
async function isAutoTitleEnabled(): Promise<boolean> {
  try {
    const db = await getDb();
    const blob = await readSettingsJson<Record<string, unknown> | null>(db, CHAMBER_SETTINGS_KEY, null);
    const value = blob?.autoSessionTitle;
    return typeof value === 'boolean' ? value : AUTO_SESSION_TITLE_DEFAULT;
  } catch {
    return AUTO_SESSION_TITLE_DEFAULT;
  }
}

/**
 * Generate and persist a session title when the session has none yet.
 *
 * Called once per settled run. Every bail-out is deliberate: a named session
 * must never be renamed by this path, and a generation already in flight must
 * not be duplicated. Failures are swallowed — an auto-title is a convenience,
 * and the next turn retries.
 */
export async function triggerAutoSessionTitle(host: AutoTitleHost): Promise<void> {
  if (host.autoTitleInFlight || !host.sessionId) return;
  if (!(await isAutoTitleEnabled())) return;

  host.autoTitleInFlight = true;
  try {
    // Re-read the name from omp rather than trusting a cached value: a rename
    // made in another tab (or by omp's own TUI on the same session file) would
    // otherwise be overwritten by the `"user"` write `/rename` performs.
    const state = await host.proc.sendCommand<RpcSessionState>({ type: 'get_state' }, GET_STATE_TIMEOUT_MS);
    if (state.sessionName?.trim()) return;
    // The session changed under us (a reset, or a `switch_session`): the name
    // we just read belongs to a different conversation.
    if (state.sessionId !== host.sessionId) return;

    // Direct `proc` write, NOT the chamber's prompt dispatch: this is
    // background work, so it must not mark the session streaming or claim the
    // sidebar's run row. omp's ack is immediate (`agentInvoked:false`); the
    // generation itself streams back later as ordinary frames.
    await host.proc.sendCommand({ type: 'prompt', message: GENERATE_TITLE_COMMAND }, PROMPT_ACK_TIMEOUT_MS);
    // Accepted — the diagnostics omp is about to emit belong to this request,
    // not to anything the operator typed.
    markTitleRequestSent(host);
  } catch {
    // Provider error, timeout, or a child that went away — leave the session
    // unnamed; the next settled run tries again.
  } finally {
    host.autoTitleInFlight = false;
  }
}
