// Runtime helpers for the OMPChamber CLI: registry persistence, process
// liveness, server entry resolution, health probing and detached spawning.
// Only node: builtins plus the global fetch are used.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

import { getLogFilePath, getRegistryPath, ensureDataDirs, getRunDir } from '@/cli/lib/paths.js';
import { killChildTree, STOP_TIMEOUT_MS } from '@/cli/lib/process-lifecycle.js';

const HEALTH_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 30_000;

/**
 * Read and parse the registry entry for `port`. Returns null on any error.
 */
export async function readRegistry(port) {
  try {
    const parsed = await Bun.file(getRegistryPath(port)).json();
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read every `<port>.json` registry entry in the run directory.
 */
export async function listRegistries() {
  try {
    const dir = getRunDir();
    const entries = [];
    for (const file of fs.readdirSync(dir)) {
      if (!/^\d+\.json$/.test(file)) continue;
      try {
        const parsed = await Bun.file(path.join(dir, file)).json();
        if (parsed && typeof parsed === 'object') entries.push(parsed);
      } catch {
        // Skip unreadable or corrupt registry files.
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Atomically write a registry entry (tmp file + rename) with owner-only perms.
 */
export function writeRegistry(entry) {
  if (!entry || entry.port === undefined || entry.port === null) {
    throw new Error('writeRegistry requires an entry with a port');
  }
  ensureDataDirs();
  const target = getRegistryPath(entry.port);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
  return target;
}

/**
 * Remove a registry entry. Never throws.
 */
export function removeRegistry(port) {
  try {
    fs.rmSync(getRegistryPath(port), { force: true });
  } catch {
    // Nothing to do: the registry is best-effort state.
  }
}

/**
 * Liveness-only check for a PID. Never throws.
 */
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registry entry whose recorded PID is alive. With no port, returns the first
 * live instance; otherwise null.
 */
export async function findLiveInstance(port) {
  if (port === null || port === undefined) {
    const all = await listRegistries();
    return all.find((entry) => entry && isProcessAlive(Number(entry.pid))) ?? null;
  }
  const entry = await readRegistry(port);
  if (entry && isProcessAlive(Number(entry.pid))) return entry;
  return null;
}

/**
 * Map a bind host to an address that is actually reachable for probing.
 */
export function probeHost(host) {
  if (host === '0.0.0.0' || host === '::' || host === '' || host === null || host === undefined) {
    return '127.0.0.1';
  }
  return host;
}

function isBun(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return false;
  const probe = Bun.spawnSync([candidate, '--version']);
  return probe.success;
}

/**
 * Locate the Bun runtime. The server imports `@/...` path aliases and ships as
 * TypeScript, so it must run under Bun rather than whatever Node happens to be
 * executing this CLI.
 */
export function resolveBunBin() {
  const override = Bun.env.OMPCHAMBER_BUN;
  if (isBun(override)) return override;

  const execDir = process.execPath;
  if (/(^|[\\/])bun$/.test(execDir) && isBun(execDir)) return execDir;

  const candidates = [
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
    '/usr/bin/bun',
  ];
  for (const candidate of candidates) {
    if (isBun(candidate)) return candidate;
  }

  const found = Bun.which('bun');
  if (isBun(found)) return found;

  throw new Error('Could not locate the Bun runtime. Install it from https://bun.sh and retry.');
}

/**
 * Build the executable + args + env for a dev or prod server run.
 *
 * Bun executes the TypeScript entry directly in both modes, so dev and prod
 * differ only by NODE_ENV — the client bundle in `dist/client` is required by
 * the SSR shell either way.
 */
export function buildServeInvocation({ pkgRoot, mode, port, host }) {
  const entry = path.join(pkgRoot, 'src', 'server', 'index.ts');
  if (!fs.existsSync(entry)) {
    throw new Error(`Could not locate the server entry at ${entry}.`);
  }
  if (mode === 'prod' && !fs.existsSync(path.join(pkgRoot, 'dist', 'client', 'index.html'))) {
    throw new Error('No client build found. Run `bun run build` and retry.');
  }
  return {
    file: resolveBunBin(),
    args: [entry],
    env: {
      ...Bun.env,
      NODE_ENV: mode === 'prod' ? 'production' : 'development',
      PORT: String(port),
      HOST: host,
    },
  };
}

/**
 * Spawn a detached server, stream its output to the per-port log file and
 * persist the registry entry.
 */
export function spawnDetachedServer({ pkgRoot, mode, port, host }) {
  ensureDataDirs();
  const logFile = getLogFilePath(port);
  const fd = fs.openSync(logFile, 'a');
  const { file, args, env } = buildServeInvocation({ pkgRoot, mode, port, host });

  let child;
  try {
    child = spawn(file, args, {
      cwd: pkgRoot,
      detached: true,
      stdio: ['ignore', fd, fd],
      env,
    });
    child.unref();
  } finally {
    fs.closeSync(fd);
  }

  const entry = {
    pid: child.pid,
    port,
    host,
    mode,
    startedAt: new Date().toISOString(),
    logFile,
    url: `http://${probeHost(host)}:${port}`,
  };
  writeRegistry(entry);
  return { child, entry };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `/api/health` until a 200 with a JSON body arrives, else null.
 */
export async function waitForHealth(port, host, timeoutMs = HEALTH_TIMEOUT_MS) {
  const url = `http://${probeHost(host)}:${port}/api/health`;
  const deadline = Date.now() + Math.max(0, timeoutMs);

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === 'object') return body;
      }
    } catch {
      // Server not up yet; keep polling until the deadline.
    }
    if (Date.now() >= deadline) break;
    await sleep(HEALTH_INTERVAL_MS);
  }
  return null;
}

function waitForProcessExit(pid, timeoutMs) {
  if (!isProcessAlive(pid)) return Promise.resolve(true);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  return new Promise((resolve) => {
    const tick = () => {
      if (!isProcessAlive(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * SIGTERM the detached process group, escalate to SIGKILL after the timeout,
 * then remove the registry entry. Resolves true once the PID is gone.
 */
export async function stopInstance(entry, { timeoutMs = STOP_TIMEOUT_MS } = {}) {
  const port = entry?.port;
  const pid = Number(entry?.pid);
  let gone = true;

  if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) {
    const target = { pid, kill: (signal) => process.kill(pid, signal) };
    killChildTree(target, false);
    gone = await waitForProcessExit(pid, timeoutMs);
    if (!gone) {
      killChildTree(target, true);
      gone = await waitForProcessExit(pid, timeoutMs);
    }
  }

  if (port !== undefined && port !== null) removeRegistry(port);
  return gone;
}
