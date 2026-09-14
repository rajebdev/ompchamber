import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the OMPChamber data directory.
 *
 * Matches the convention used by app/db.server.ts so the CLI and the web
 * console always agree on where state lives.
 */
export function getDataDir() {
  const override = process.env.OMPCHAMBER_DATA_DIR;
  if (typeof override === 'string' && override.trim().length > 0) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), '.ompchamber');
}

/**
 * Directory holding per-instance registry files (`<port>.json`).
 * Created on demand with owner-only permissions.
 */
export function getRunDir() {
  const dir = path.join(getDataDir(), 'run');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Directory holding per-instance log files.
 */
export function getLogsDir() {
  const dir = path.join(getDataDir(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Registry file describing the running instance bound to `port`.
 */
export function getRegistryPath(port) {
  return path.join(getRunDir(), `${port}.json`);
}

/**
 * Log file for the running instance bound to `port`.
 */
export function getLogFilePath(port) {
  return path.join(getLogsDir(), `ompchamber-${port}.log`);
}

/**
 * Ensure the full data directory tree exists and return every path.
 */
export function ensureDataDirs() {
  return {
    dataDir: getDataDir(),
    runDir: getRunDir(),
    logsDir: getLogsDir(),
  };
}
