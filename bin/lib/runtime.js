// Runtime helpers for the OMPChamber CLI: registry persistence, process
// liveness, Remix binary resolution, health probing and detached spawning.
// Only node: builtins plus the global fetch are used.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { getLogFilePath, getRegistryPath, ensureDataDirs, getRunDir } from './paths.js';
import { killChildTree, STOP_TIMEOUT_MS } from './process-lifecycle.js';

const HEALTH_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 30_000;

/**
 * Read and parse the registry entry for `port`. Returns null on any error.
 */
export function readRegistry(port) {
  try {
    const raw = fs.readFileSync(getRegistryPath(port), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read every `<port>.json` registry entry in the run directory.
 */
export function listRegistries() {
  try {
    const dir = getRunDir();
    const entries = [];
    for (const file of fs.readdirSync(dir)) {
      if (!/^\d+\.json$/.test(file)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
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
export function findLiveInstance(port) {
  if (port === null || port === undefined) {
    return listRegistries().find((entry) => entry && isProcessAlive(Number(entry.pid))) ?? null;
  }
  const entry = readRegistry(port);
  if (entry && isProcessAlive(Number(entry.pid))) return entry;
  return null;
}

function resolveFromPackage(specifier, pkgRoot) {
  for (const base of [import.meta.url, pkgRoot ? path.join(pkgRoot, 'package.json') : null]) {
    if (!base) continue;
    try {
      const resolved = createRequire(base).resolve(specifier);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // Try the next resolution base.
    }
  }
  return null;
}

function resolveBinPath(pkgRoot, binName) {
  if (!pkgRoot) return null;
  const binPath = path.join(pkgRoot, 'node_modules', '.bin', binName);
  try {
    const real = fs.realpathSync(binPath);
    if (fs.existsSync(real)) return real;
  } catch {
    // Fall through to the raw symlink.
  }
  try {
    if (fs.existsSync(binPath)) return binPath;
  } catch {
    // No binary available.
  }
  return null;
}

/**
 * Absolute path to the `@remix-run/dev` CLI entry.
 */
export function resolveRemixBin(pkgRoot) {
  return resolveFromPackage('@remix-run/dev/dist/cli.js', pkgRoot)
    ?? resolveBinPath(pkgRoot, 'remix');
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

/**
 * Build the executable + args + env for a dev or prod server run.
 */
export function buildServeInvocation({ pkgRoot, mode, port, host }) {
  if (mode === 'prod') {
    // The production entry owns the HTTP server so it can also carry the agent
    // event WebSocket; remix-serve exposes no upgrade hook.
    const entry = path.join(pkgRoot, 'server', 'index.js');
    if (!fs.existsSync(entry)) {
      throw new Error(`Could not locate the production server entry at ${entry}. Run \`bun run build\` and retry.`);
    }
    return {
      file: process.execPath,
      args: [entry],
      env: { ...process.env, PORT: String(port), HOST: host },
    };
  }

  const remixBin = resolveRemixBin(pkgRoot);
  if (!remixBin) {
    throw new Error('Could not locate the @remix-run/dev CLI. Run `bun install` and retry.');
  }
  return {
    file: process.execPath,
    args: [remixBin, 'vite:dev', `--port=${port}`, `--host=${host}`],
    env: { ...process.env },
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
