/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Process identity for a PID recorded for a port.
 *
 * Liveness alone cannot answer "is this PID still an OMPChamber server": after
 * an ungraceful exit the PID can be recycled to an unrelated process, and a
 * liveness-only check then reports a live instance nobody is serving — which
 * either blocks startup on a free port or, worse, lets a stale record name a
 * stranger. Identity therefore comes from the OS command line, so a recycled
 * PID reads back as `mismatched`.
 *
 * Where `ps` is unavailable (minimal containers) the on-disk `/proc` entry
 * still answers the identity question on Linux; on Windows, where neither is
 * cheap, identity is reported as `unknown` and callers fall back to liveness.
 */

import fs from 'fs';

export type ProcessState = 'dead' | 'matched' | 'mismatched' | 'unknown';

interface ProcessRow {
  pid: number;
  /** `ps` state column — `Z…` means defunct (exited, awaiting reaping). */
  state: string;
  command: string;
}

let cachedTable: { at: number; rows: ProcessRow[] } | null = null;

/**
 * One snapshot of the process table, memoized for a startup decision.
 *
 * Every question in a port check happens within milliseconds, so a briefly
 * cached view is strictly better than spawning `ps` per question.
 */
function readProcessTable(maxAgeMs = 250): ProcessRow[] {
  if (cachedTable && Date.now() - cachedTable.at < maxAgeMs) return cachedTable.rows;
  const rows: ProcessRow[] = [];
  try {
    const snapshot = Bun.spawnSync({
      cmd: ['ps', '-ax', '-o', 'pid=,stat=,command='],
      stdout: 'pipe',
      stderr: 'ignore',
    });
    if (snapshot.success) {
      for (const line of snapshot.stdout.toString().split('\n')) {
        const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
        if (!match) continue;
        rows.push({ pid: Number(match[1]), state: match[2], command: match[3].trim() });
      }
    }
  } catch {
    // No `ps` on PATH: identity falls back to /proc, liveness to signal 0.
  }
  cachedTable = { at: Date.now(), rows };
  return rows;
}

/**
 * Liveness check. Never throws.
 *
 * A defunct (zombie) PID still answers signal 0 — the process has exited and is
 * only waiting for its parent to reap it — so a zombie counts as not alive: it
 * holds no port and will never run again. Without this, a stop that worked
 * looks like a process that "ignored SIGTERM", and stop-waits spin until their
 * timeout.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const row = readProcessTable().find((entry) => entry.pid === pid);
  return row ? !row.state.startsWith('Z') : true;
}

/** Command line for a live PID, or null when this platform cannot report one. */
function readProcessCommandLine(pid: number): string | null {
  const row = readProcessTable().find((entry) => entry.pid === pid);
  if (row) return row.command.length > 0 ? row.command : null;
  if (process.platform === 'linux') {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * `dead` | `matched` | `mismatched` | `unknown` for a PID.
 *
 * `unknown` means identity could not be read; callers treat it as "alive but
 * unverified" — never as confirmation that the PID is ours.
 */
export function getProcessState(pid: number): ProcessState {
  if (!isProcessAlive(pid)) return 'dead';
  const command = readProcessCommandLine(pid);
  if (command === null) return 'unknown';
  return command.toLowerCase().includes('ompchamber') ? 'matched' : 'mismatched';
}
