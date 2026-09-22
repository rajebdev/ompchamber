/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replacing the instance that is serving an update request.
 *
 * A server cannot restart itself: the process holding the port has to exit
 * before a replacement can bind it, and the update response has to leave first.
 * So once the files on disk are replaced, the work goes to a detached
 * `ompchamber restart --port <port>` — the same stop-then-serve the CLI runs
 * after `ompchamber update`.
 *
 * Instances the CLI did not start are left alone. `bun run dev` and
 * `bun run start` execute this package's source in the user's own shell, and an
 * external supervisor (systemd, pm2, a container) owns the process it started;
 * all of them record `direct`, and replacing any of them would break a loop
 * OMPChamber does not own — or fight a second daemon for the port. Their own
 * launcher is what brings the new files up.
 */

import { existsSync } from 'node:fs';
import { join as joinPath, resolve as resolvePath } from 'node:path';

import { resolveBunBin } from '@/server/lib/lifecycle/bun';
import { listInstanceRecords } from '@/server/lib/lifecycle/instance';
import { resolveLaunchMode } from '@/server/lib/lifecycle/launch-mode';

/** Package root of the running copy: src/server/lib/lifecycle -> four levels up. */
const PKG_ROOT = resolvePath(import.meta.dir, '..', '..', '..', '..');

/**
 * Time between answering the update request and stopping the server. The
 * response is a small JSON body on a local listener; this is the margin that
 * keeps the console's toast from dying with the process that sent it.
 */
export const RESTART_GRACE_MS = 1_200;

export interface SelfRestartPlan {
  /** A detached restart is armed; `message` says so. */
  restarting: boolean;
  /** What to tell the user, either way. */
  message: string;
}

/**
 * True when the CLI owns this instance's lifecycle and may replace it. `direct`
 * is every server OMPChamber did not start: `bun run dev`, `bun run start`, a
 * manual `bun src/server/index.ts`, or an external supervisor.
 */
export function isAutoRestartable(launchMode: string | null | undefined): boolean {
  return launchMode === 'daemon' || launchMode === 'foreground';
}

/** One-line reason an instance is left running, shared by the CLI and console. */
export function skipRestartNote(launchMode: string | null | undefined): string {
  if (launchMode === 'direct') {
    return 'this instance runs from source (`bun run dev` / `bun run start`) — start it again to apply the update';
  }
  return 'this instance is not managed by the ompchamber CLI — restart it yourself to apply the update';
}

/** The record this process wrote for itself; falls back to the env it was launched with. */
function ownInstance(): { port: number; launchMode: string } | null {
  const record = listInstanceRecords().find((entry) => entry.pid === process.pid);
  if (record) return { port: record.port, launchMode: record.launchMode };

  const port = Number(Bun.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { port, launchMode: resolveLaunchMode() };
}

/** `ompchamber restart --port <port>` for the install this server runs from. */
function restartCommand(port: number): string[] | null {
  const cli = joinPath(PKG_ROOT, 'src', 'cli', 'ompchamber.js');
  if (!existsSync(cli)) return null;
  return [resolveBunBin(), cli, 'restart', '--port', String(port)];
}

/**
 * Stop and start this port again, once the response has been delivered. The
 * helper is detached so this process exiting does not take it down, and it
 * removes this port's record itself (`stopInstance`) before serving.
 */
export function scheduleSelfRestart(): SelfRestartPlan {
  const self = ownInstance();
  if (!self) {
    return { restarting: false, message: 'This instance could not be identified — restart it yourself to apply the update.' };
  }

  if (!isAutoRestartable(self.launchMode)) {
    return { restarting: false, message: skipRestartNote(self.launchMode) };
  }

  const cmd = restartCommand(self.port);
  if (!cmd) {
    return { restarting: false, message: `The ompchamber CLI is missing from ${PKG_ROOT} — restart it yourself to apply the update.` };
  }

  setTimeout(() => {
    console.log(`[ompchamber] restarting on port ${self.port}: ${cmd.join(' ')}`);
    try {
      Bun.spawn({ cmd, cwd: PKG_ROOT, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', detached: true }).unref();
    } catch (err) {
      console.error(`[ompchamber] restart helper could not be started: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, RESTART_GRACE_MS);

  return { restarting: true, message: `Restarting OMPChamber on port ${self.port} to apply it — the console reconnects on its own.` };
}
