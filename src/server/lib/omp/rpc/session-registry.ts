/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global omp session registry: keeps one AgentSessionWrapper per session id,
 * exposes lookups, and broadcasts running-session changes to subscribers.
 * Split out of rpc-manager.ts so each file stays under the repo's per-file
 * size ceiling. Importing AgentSessionWrapper here is a runtime-only circular
 * reference with rpc-manager (the wrapper calls notifyRunningChange) — both
 * usages happen inside functions, never at module init.
 */

import { existsSync } from 'fs';
import { RpcProcess } from '@/server/lib/omp/rpc/process';
import { buildSessionSpawnArgs } from '@/server/lib/omp/rpc/constants';
import { AgentSessionWrapper } from '@/server/lib/omp/rpc/manager';
import { DEFAULT_APPROVAL_MODE, type ApprovalMode } from '@/shared/lib/omp/config/access-mode';

export interface RunningRpcSession {
  id: string;
  cwd: string;
}

export interface RunningSessionUpdate {
  ids: string[];
  runningSessions: RunningRpcSession[];
  refreshSessionList: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompSessions: Map<string, AgentSessionWrapper> | undefined;
  // eslint-disable-next-line no-var
  var __ompStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
  // eslint-disable-next-line no-var
  var __ompRunningListeners: Set<(update: RunningSessionUpdate) => void> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__ompSessions) {
    globalThis.__ompSessions = new Map();
    const cleanup = () => globalThis.__ompSessions?.forEach((s) => s.destroy());
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }
  return globalThis.__ompSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__ompStartLocks) globalThis.__ompStartLocks = new Map();
  return globalThis.__ompStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getRunningRpcSessions(): RunningRpcSession[] {
  const map = new Map<string, string>();
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) {
      const realId = session.sessionId || sessionId;
      map.set(realId, session.cwd);
    }
  }
  return [...map.entries()].map(([id, cwd]) => ({ id, cwd }));
}

export function getRunningRpcSessionIds(): string[] {
  return getRunningRpcSessions().map((s) => s.id);
}

function getRunningListeners(): Set<(update: RunningSessionUpdate) => void> {
  if (!globalThis.__ompRunningListeners) globalThis.__ompRunningListeners = new Set();
  return globalThis.__ompRunningListeners;
}

/** Subscribe to running-session-id changes and session-list refreshes. */
export function subscribeRunningSessions(listener: (update: RunningSessionUpdate) => void): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let lastRunningSnapshot = '';

/**
 * Recompute the running-session-id set and, when it changes, broadcast it.
 * A session file may first appear after its id starts running, so callers can
 * force one otherwise-identical update to refresh sidebar session metadata.
 */
export function notifyRunningChange({ refreshSessionList = false }: { refreshSessionList?: boolean } = {}): void {
  const runningSessions = getRunningRpcSessions();
  const ids = runningSessions.map((s) => s.id);
  if (runningSessions.length === 0 && lastRunningSnapshot === '[]' && !refreshSessionList) return;
  const snapshot = JSON.stringify(runningSessions.slice().sort((a, b) => a.id.localeCompare(b.id)));
  if (snapshot === lastRunningSnapshot && !refreshSessionList) return;
  lastRunningSnapshot = snapshot;
  const update: RunningSessionUpdate = { ids, runningSessions, refreshSessionList };
  for (const listener of getRunningListeners()) {
    try { listener(update); } catch { /* ignore listener errors */ }
  }
}

// The approval mode each wrapper's omp child was actually spawned with. omp has
// no RPC setter for it, so a live wrapper is stale once the desired mode
// differs and must be respawned with the new --approval-mode flag.
const spawnApprovalModes = new WeakMap<AgentSessionWrapper, ApprovalMode>();

export function getSpawnApprovalMode(session: AgentSessionWrapper): ApprovalMode {
  return spawnApprovalModes.get(session) ?? DEFAULT_APPROVAL_MODE;
}

/** Destroy an idle session whose spawned approval mode differs from `desired`
 *  so the caller can respawn it with the new --approval-mode flag.
 *  Returns true when the session was destroyed (caller MUST respawn). */
export async function reconcileSpawnApprovalMode(session: AgentSessionWrapper, desired: ApprovalMode): Promise<boolean> {
  if (getSpawnApprovalMode(session) === desired) return false;
  // Never kill an in-flight run — the caller would lose the active turn.
  if (session.isRunning()) return false;
  // A brand-new session has no JSONL on disk yet; destroying it would 404 the
  // next request that tries to resolve its file.
  if (!session.sessionFile) return false;
  if (!existsSync(session.sessionFile)) return false;
  await session.destroyAndWait();
  return true;
}

/**
 * Get or create the omp RPC process for the given session.
 * For new sessions (sessionFile === ''), omp generates its own id.
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  recordedCwd?: string | null,
  approvalMode?: ApprovalMode,
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) {
    return { session: existing, realSessionId: sessionId };
  }
  if (existing?.destroyPromise) await existing.destroyPromise;

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const holder: { wrapper?: AgentSessionWrapper } = {};
    const proc = new RpcProcess({
      cwd,
      extraArgs: buildSessionSpawnArgs(sessionFile, approvalMode),
      onExit: ({ stderrTail }) => holder.wrapper?.handleProcessExit(stderrTail),
    });
    const created = new AgentSessionWrapper(proc, cwd, recordedCwd);
    spawnApprovalModes.set(created, approvalMode ?? DEFAULT_APPROVAL_MODE);
    holder.wrapper = created;
    created.start();
    try {
      await created.waitUntilReady();
    } catch (error) {
      await created.destroyAndWait();
      throw error;
    }

    const realSessionId = created.sessionId;
    created.onDestroy(() => {
      if (registry.get(created.sessionId) === created) registry.delete(created.sessionId);
      if (registry.get(realSessionId) === created) registry.delete(realSessionId);
    });
    registry.set(realSessionId, created);
    return { session: created, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}

// ============================================================================
// Prewarm pool: one idle "new session" spawned ahead of the first prompt so
// adopting it on send skips the multi-second omp boot. Keyed per cwd (the
// spawn's project directory) with its approval mode; consumed exactly once by
// startNewRpcSession.
// ============================================================================

interface PrewarmedEntry {
  cwd: string;
  approvalMode: ApprovalMode;
  /** Resolves when the wrapper is ready, or rejects when the spawn failed or
   *  the entry was torn down before being claimed. */
  ready: Promise<AgentSessionWrapper>;
  claimed: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompPrewarmed: Map<string, PrewarmedEntry> | undefined;
}

function getPrewarmed(): Map<string, PrewarmedEntry> {
  if (!globalThis.__ompPrewarmed) globalThis.__ompPrewarmed = new Map();
  return globalThis.__ompPrewarmed;
}

/** Spawn (at most one) idle omp process for `cwd` so the next new-session
 *  send starts instantly. Fire-and-forget; a failed spawn just clears itself.
 *  Safe to call repeatedly — an existing live or in-flight entry wins. */
export function prewarmRpcSession(cwd: string, approvalMode?: ApprovalMode): void {
  const pool = getPrewarmed();
  const existing = pool.get(cwd);
  if (existing) return;
  const mode = approvalMode ?? DEFAULT_APPROVAL_MODE;
  const holder: { wrapper?: AgentSessionWrapper } = {};
  const proc = new RpcProcess({
    cwd,
    extraArgs: buildSessionSpawnArgs('', mode),
    onExit: ({ stderrTail }) => holder.wrapper?.handleProcessExit(stderrTail),
  });
  const wrapper = new AgentSessionWrapper(proc, cwd);
  spawnApprovalModes.set(wrapper, mode);
  holder.wrapper = wrapper;
  wrapper.start();
  const ready = wrapper
    .waitUntilReady()
    .then(() => {
      // A dead wrapper (idle-kill, crash, exit) must not be handed out.
      if (!wrapper.isAlive()) throw new Error('prewarmed process exited');
      return wrapper;
    })
    .catch((error) => {
      void wrapper.destroyAndWait();
      const entry = pool.get(cwd);
      if (entry?.ready === ready) pool.delete(cwd);
      throw error;
    });
  pool.set(cwd, { cwd, approvalMode: mode, ready, claimed: false });
}

/** Consume the prewarmed process for `cwd` when its approval mode matches, or
 *  spawn a fresh session. The returned wrapper is already registered under its
 *  real session id, mirroring startRpcSession's bookkeeping. */
export async function startNewRpcSession(
  cwd: string,
  approvalMode?: ApprovalMode,
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const pool = getPrewarmed();
  const entry = pool.get(cwd);
  const mode = approvalMode ?? DEFAULT_APPROVAL_MODE;
  let wrapper: AgentSessionWrapper | undefined;
  if (entry && !entry.claimed && entry.approvalMode === mode) {
    entry.claimed = true;
    pool.delete(cwd);
    try {
      const candidate = await entry.ready;
      // Died between readiness and claim (idle kill, crash) → cold spawn.
      if (candidate.isAlive()) wrapper = candidate;
      else await candidate.destroyAndWait();
    } catch {
      wrapper = undefined; // fall through to a cold spawn
    }
  } else if (entry && !entry.claimed) {
    // Wrong mode: the prewarmed process cannot serve this request. Kill it and
    // spawn cold — reconcileSpawnApprovalMode would refuse (no session file).
    entry.claimed = true;
    pool.delete(cwd);
    void entry.ready.then((w) => w.destroyAndWait()).catch(() => {});
  }

  if (!wrapper) {
    return startRpcSession(`__new__${crypto.randomUUID()}`, '', cwd, undefined, mode);
  }

  const registry = getRegistry();
  const realSessionId = wrapper.sessionId;
  wrapper.onDestroy(() => {
    if (registry.get(wrapper.sessionId) === wrapper) registry.delete(wrapper.sessionId);
    if (registry.get(realSessionId) === wrapper) registry.delete(realSessionId);
  });
  registry.set(realSessionId, wrapper);
  return { session: wrapper, realSessionId };
}
