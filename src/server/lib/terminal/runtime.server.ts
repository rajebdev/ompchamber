/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The terminal registry: which shells are live, who is watching them, and when
 * they die.
 *
 * One real shell per terminal id, created on the first `attach` (there is no
 * separate create endpoint to race against), kept alive while clients come and
 * go, and killed through the process group so the commands it started die with
 * it. Session mechanics live in `session.server.ts`; this module owns the map,
 * the viewer sets, the idle reaper and process-exit cleanup.
 */

import path from 'path';
import { detectBusyShells, type ShellProcess } from '@/server/lib/terminal/foreground';
import {
  TERMINATION_GRACE_MS,
  TerminalRuntimeError,
  closeTerminalStream,
  createSession,
  signalGroup,
  snapshotOf,
  type AttachRequest,
  type TerminalSession,
  type TerminalViewer,
} from '@/server/lib/terminal/session.server';
import { TERMINAL_MAX_INPUT_BYTES, clampTerminalSize, type TerminalSnapshot } from '@/shared/lib/workspace/terminal/protocol';

const MAX_TERMINALS = 8;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_SWEEP_MS = 60 * 1000;
/** Quiet period before a resize burst is committed to the PTY. */
const RESIZE_SETTLE_MS = 120;

export interface TerminalAttachment {
  snapshot: TerminalSnapshot;
  /** Retained scrollback, to be sent after the `ready` frame. */
  replay: Uint8Array;
}

/**
 * The registry lives on `globalThis`, not in a module-local binding.
 *
 * `bun run --hot` re-evaluates this module on every server-file edit, but the
 * PTY children are detached sessions that keep running. A module-local `Map`
 * would be replaced by a fresh empty one on each reload, leaving the previous
 * shells alive with nothing tracking them — unreachable from the client, never
 * counted, never reaped, and still holding their slots. Anchoring the map to
 * the process keeps a reload from orphaning anything.
 */
declare global {
  // eslint-disable-next-line no-var
  var __ompChamberTerminals: Map<string, TerminalSession> | undefined;
  // eslint-disable-next-line no-var
  var __ompChamberTerminalSweep: ReturnType<typeof setInterval> | undefined;
  // eslint-disable-next-line no-var
  var __ompChamberTerminalResizes: Map<string, ReturnType<typeof setTimeout>> | undefined;
  // eslint-disable-next-line no-var
  var __ompChamberTerminalCleanupInstalled: boolean | undefined;
}

const sessions: Map<string, TerminalSession> = (globalThis.__ompChamberTerminals ??= new Map());

function getSweepTimer() {
  return globalThis.__ompChamberTerminalSweep;
}

function setSweepTimer(timer: ReturnType<typeof setInterval> | undefined) {
  globalThis.__ompChamberTerminalSweep = timer;
  return timer;
}

function getResizeTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return (globalThis.__ompChamberTerminalResizes ??= new Map());
}

/**
 * Attach `viewer` to `request.id`, creating the shell when the id is unknown.
 *
 * Registration and history capture happen in one synchronous block: Bun cannot
 * interleave a PTY `data` callback inside it, so the viewer can neither miss
 * output nor receive it twice.
 *
 * The cap counts *live* shells only. An exited shell is a corpse holding a
 * scrollback nobody is reading, and letting corpses consume the budget is how
 * a session that restarted a shell a few times hits the limit with nothing
 * running: every restart leaves its predecessor behind.
 */
export async function attachTerminal(viewer: TerminalViewer, request: AttachRequest): Promise<TerminalAttachment> {
  let session = sessions.get(request.id);
  if (!session) {
    reclaimExitedTerminals();
    if ((await countLiveTerminals()) >= MAX_TERMINALS) {
      throw new TerminalRuntimeError('capacity', `Terminal limit reached (${MAX_TERMINALS} busy shells)`);
    }
    const created = await createSession(request);
    sessions.set(request.id, created);
    // An exit with nobody watching is the common case for a replaced shell
    // (restart, repo switch): reap it as soon as it lands instead of leaving
    // the record for the sweep, which is up to a minute of holding a slot.
    void created.proc?.exited.then(() => {
      if (created.viewers.size === 0) forgetTerminal(created.id);
    });
    ensureSweeper();
    session = created;
  }

  const replay = session.history.replay();
  const snapshot = snapshotOf(session);
  session.viewers.add(viewer);
  session.lastActivity = Date.now();
  return { snapshot, replay };
}

/**
 * Shells that are actually doing work, which is what the cap budgets.
 *
 * Two things are deliberately excluded: an exited shell (a corpse with a
 * scrollback) and a shell sitting at its prompt — the PTY's foreground process
 * group tells them apart exactly (see `foreground.ts`). Counting idle shells
 * is how a panel that was restarted or switched a few times pins the budget
 * with nothing running, and the next attach is refused.
 */
export async function countLiveTerminals(): Promise<number> {
  const running: ShellProcess[] = [];
  for (const session of sessions.values()) {
    if (session.status !== 'running' || !session.proc) continue;
    running.push({ id: session.id, pid: session.proc.pid });
  }
  const busy = await detectBusyShells(running);
  return busy.size;
}

/**
 * Drop exited shells that nobody is watching.
 *
 * Run before a create, not only on the idle sweep: the sweep is a minute away,
 * and a burst of restarts inside that window would otherwise be rejected while
 * every corpse in the way is already dead.
 */
export function reclaimExitedTerminals(): number {
  let reclaimed = 0;
  for (const [id, session] of sessions) {
    if (session.status !== 'exited') continue;
    if (session.viewers.size > 0) continue;
    forgetTerminal(id);
    reclaimed += 1;
  }
  return reclaimed;
}

export function detachTerminal(viewer: TerminalViewer, id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.viewers.delete(viewer);
  session.lastActivity = Date.now();
  // The last viewer leaving a finished shell leaves nothing behind worth
  // keeping: no process to reattach to, and a scrollback nobody will read.
  if (session.status === 'exited' && session.viewers.size === 0) forgetTerminal(id);
}

/**
 * Live terminal summaries, optionally narrowed to one scope, so a client can
 * adopt a shell it does not have an id for (a reloaded page, a second tab).
 *
 * `busy` marks a shell with a foreground command — the panel shows it as
 * running, and the cap budgets it. One `ps` for the whole list.
 */
export async function listTerminals(root?: string | null, repo?: string | null): Promise<TerminalSnapshot[]> {
  const scope = root ? (repo && repo !== '.' ? path.join(root, repo) : root) : null;
  const running: ShellProcess[] = [];
  const out: TerminalSnapshot[] = [];
  for (const session of sessions.values()) {
    if (scope && !isWithin(session.cwd, scope)) continue;
    if (session.status === 'running' && session.proc) {
      running.push({ id: session.id, pid: session.proc.pid });
    }
    out.push(snapshotOf(session));
  }
  const busy = await detectBusyShells(running);
  return out.map((snapshot) => ({ ...snapshot, busy: busy.has(snapshot.id) }));
}

function isWithin(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

export function writeTerminalInput(id: string, data: Uint8Array): void {
  const session = sessions.get(id);
  if (!session || session.status !== 'running') return;
  if (data.length === 0 || data.length > TERMINAL_MAX_INPUT_BYTES) return;
  session.lastActivity = Date.now();
  try {
    session.term.write(data);
  } catch {
    // The PTY closed between the status check and the write.
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session || session.status !== 'running') return;
  const size = clampTerminalSize(cols, rows);
  if (size.cols === session.cols && size.rows === session.rows) return;
  session.cols = size.cols;
  session.rows = size.rows;
  session.lastActivity = Date.now();
  try {
    session.term.resize(size.cols, size.rows);
  } catch {
    return;
  }
  // resize() updates the winsize but never signals the child, so a TUI would
  // not repaint. Deliver SIGWINCH ourselves.
  signalGroup(session, 'SIGWINCH');
}

/**
 * Debounce for `resizeTerminal`.
 *
 * A panel drag produces a burst of sizes — the pointer moves in steps and
 * xterm's FitAddon refits on every animation frame — and each accepted size
 * sends SIGWINCH. The shell answers every one of them by redrawing its prompt,
 * so a single drag used to print the prompt a dozen times (measured: 10
 * SIGWINCH in one second for one drag).
 *
 * Only the trailing size matters: the PTY ends at the final grid either way,
 * and a repaint of an intermediate size is invisible work. A single timeout is
 * reused so the burst coalesces into one signal.
 */
const resizeTimers = getResizeTimers();

export function resizeTerminalDebounced(id: string, cols: number, rows: number): void {
  const pending = resizeTimers.get(id);
  if (pending) clearTimeout(pending);
  resizeTimers.set(
    id,
    setTimeout(() => {
      resizeTimers.delete(id);
      resizeTerminal(id, cols, rows);
    }, RESIZE_SETTLE_MS),
  );
}

/**
 * Kill the shell for `id`, keeping the record and its viewers: the process exit
 * is what reports the real exit code, so nothing is synthesized here.
 *
 * SIGHUP, not SIGTERM. An interactive shell ignores SIGTERM — verified on
 * macOS: `kill -TERM` to a zsh process group left it alive indefinitely, while
 * SIGHUP terminated it in ~150 ms along with its background jobs. SIGHUP is
 * also the semantically right signal: the terminal is going away.
 */
export function closeTerminal(id: string): void {
  const session = sessions.get(id);
  if (!session || session.status !== 'running') return;
  signalGroup(session, 'SIGHUP');
  setTimeout(() => {
    if (session.status === 'running') signalGroup(session, 'SIGKILL');
  }, TERMINATION_GRACE_MS).unref?.();
}

/**
 * Drop a session record and release its PTY stream. Used by the idle reaper and
 * when a client closes a terminal it does not intend to reopen — there are no
 * viewers left to inform, so a running shell is killed outright.
 */
export function forgetTerminal(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  clearPendingResize(id);
  // Close each viewer's socket, not just forget it: the record is going away,
  // so a socket left open would sit on a terminal that can never answer it.
  for (const viewer of session.viewers) viewer.drop();
  session.viewers.clear();
  if (session.status === 'running') signalGroup(session, 'SIGKILL');
  closeTerminalStream(session);
}

function clearPendingResize(id: string): void {
  const pending = resizeTimers.get(id);
  if (pending) {
    clearTimeout(pending);
    resizeTimers.delete(id);
  }
}

/**
 * Kill every shell at process exit. Synchronous by contract — `exit` handlers
 * cannot await — so it escalates straight to SIGKILL: a detached shell is its
 * own session and would otherwise outlive the server.
 */
export function disposeAllTerminals(): void {
  clearInterval(setSweepTimer(undefined));
  for (const [id, session] of sessions) {
    clearPendingResize(id);
    session.viewers.clear();
    signalGroup(session, 'SIGKILL');
    closeTerminalStream(session);
  }
  sessions.clear();
}

function ensureSweeper(): void {
  if (getSweepTimer() !== undefined) return;
  setSweepTimer(setInterval(() => {
    // Exited shells are reaped on exit and on detach; this catches the one
    // that finished while a viewer was still attached to it.
    reclaimExitedTerminals();
    const now = Date.now();
    for (const [id, session] of sessions) {
      // A live shell is only reaped when nobody watches it: an attached
      // terminal is idle by definition while the user reads its output.
      if (session.viewers.size > 0) continue;
      if (now - session.lastActivity < IDLE_TIMEOUT_MS) continue;
      forgetTerminal(id);
    }
  }, IDLE_SWEEP_MS));
  getSweepTimer()!.unref();
}

/**
 * Register process-wide cleanup exactly once. A `bun --hot` reload re-evaluates
 * this module while the shells live on, so the guard keeps a reload from
 * stacking duplicate signal handlers.
 */
declare global {
  // eslint-disable-next-line no-var
  var __ompChamberTerminalCleanupInstalled: boolean | undefined;
}

if (!globalThis.__ompChamberTerminalCleanupInstalled) {
  globalThis.__ompChamberTerminalCleanupInstalled = true;
  process.once('exit', disposeAllTerminals);
  process.once('SIGINT', disposeAllTerminals);
  process.once('SIGTERM', disposeAllTerminals);
}
