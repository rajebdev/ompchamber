/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where OMPChamber keeps per-port runtime state.
 *
 * Both the server and the CLI need these paths, and they must agree: the server
 * owns the record for the port it listens on, and the CLI reads that same record
 * to answer `status` / `stop` / `logs`. One module is what makes the agreement
 * structural — the previous split (CLI wrote, server never did) is why a server
 * started outside the CLI was invisible to every CLI command.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Root of OMPChamber's own state (~/.ompchamber, or OMPCHAMBER_DATA_DIR).
 *
 * `os.homedir()` rather than HOME: a process started without a shell (cron,
 * launchd, a service) has no HOME, and an empty value would silently move the
 * data directory to a cwd-relative path.
 */
export function getDataDir(): string {
  const override = (Bun.env.OMPCHAMBER_DATA_DIR ?? '').trim();
  if (override) {
    return path.resolve(override.startsWith('~') ? path.join(os.homedir(), override.slice(1)) : override);
  }
  return path.join(os.homedir(), '.ompchamber');
}

/** Directory holding per-instance records and handover locks (mode 0700). */
export function getRunDir(): string {
  const dir = path.join(getDataDir(), 'run');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** `<data>/run/<port>.json` — the record written by the server serving `port`. */
export function getInstancePath(port: number | string): string {
  return path.join(getRunDir(), `${port}.json`);
}

/** `<data>/run/<port>.lock` — held only while a port handover is in progress. */
export function getLockPath(port: number | string): string {
  return path.join(getRunDir(), `${port}.lock`);
}
