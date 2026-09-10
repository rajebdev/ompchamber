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

import { RpcProcess } from '@/lib/omp/rpc/process';
import { buildSessionSpawnArgs } from '@/lib/omp/rpc/constants';
import { AgentSessionWrapper } from '@/lib/omp/rpc/manager';

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

/**
 * Get or create the omp RPC process for the given session.
 * For new sessions (sessionFile === ''), omp generates its own id.
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  recordedCwd?: string | null,
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
      extraArgs: buildSessionSpawnArgs(sessionFile),
      onExit: ({ stderrTail }) => holder.wrapper?.handleProcessExit(stderrTail),
    });
    const created = new AgentSessionWrapper(proc, cwd, recordedCwd);
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
