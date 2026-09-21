// `ompchamber serve` — start the Remix dev or production server.

import { joinPath } from '@/cli/lib/path-utils.js';
import {
  spawnDetachedServer,
  buildServeInvocation,
  waitForHealth,
  findLiveInstance,
} from '@/cli/lib/runtime.js';
import { probeHost } from '@/server/lib/lifecycle/probe';
import { log, ok, warn, fail, printJson, isJson, isQuiet } from '@/cli/lib/output.js';
import { wireChildProcessLifecycle } from '@/cli/lib/process-lifecycle.js';
import { ompStartupError } from '@/server/lib/omp/core/startup';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';

export function resolvePort(options) {
  const raw = options?.port;
  if (raw !== null && raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const env = Bun.env.OMPCHAMBER_PORT;
  if (typeof env === 'string' && env.trim().length > 0) {
    const parsed = Number(env.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_PORT;
}

export function resolveHost(options) {
  if (options?.lan) return '0.0.0.0';
  const raw = options?.host;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  const env = Bun.env.OMPCHAMBER_HOST;
  if (typeof env === 'string' && env.length > 0) return env;
  return DEFAULT_HOST;
}

export async function run(options, ctx) {
  const port = resolvePort(options);
  const host = resolveHost(options);
  const mode = options?.prod ? 'prod' : 'dev';
  const json = isJson();
  const quiet = isQuiet();
  const pkgRoot = ctx?.pkgRoot ?? process.cwd();

  // The same gate the server entry applies, run here first so a missing omp
  // binary fails immediately — with no detached child spawned, no log file to
  // read and no registry entry left pointing at a process that already exited.
  const ompError = ompStartupError();
  if (ompError) fail(ompError);

  if (mode === 'prod') {
    const serverEntry = joinPath(pkgRoot, 'dist', 'client', 'index.html');
    // Bun.file().exists() is file-only (false for directories) — correct here,
    // where the target is always a regular file. For directory guards use
    // pathExists() in src/server/lib/omp/core/paths.ts.
    if (!(await Bun.file(serverEntry).exists())) {
      fail(`Production build not found at ${serverEntry}.\nRun \`bun run build\` first, then retry with --prod.`);
    }
  }

  const existing = await findLiveInstance(port);
  if (existing) {
    // Refused here as well as in the server (lib/lifecycle/port-guard) so the
    // CLI reports it immediately instead of spawning a child that exits during
    // the health wait. Nothing is stopped: freeing a port is `ompchamber stop`.
    fail(
      `Port ${port} is already served by OMPChamber (pid ${existing.pid}, ${existing.mode}).`
      + '\n  Nothing was stopped — a starting instance never stops another one.'
      + `\n  Stop it first:  ompchamber stop --port ${port}`
      + `\n  Or start on another port:  ompchamber serve --port <port>`,
    );
  }

  if (options?.foreground) {
    return runForeground({ pkgRoot, mode, port, host, quiet });
  }

  const { entry } = spawnDetachedServer({ pkgRoot, mode, port, host, launchMode: 'daemon' });

  if (!quiet && !json) {
    log(`Starting OMPChamber (${mode}) on ${entry.url} (pid ${entry.pid})...`);
  }

  const health = await waitForHealth(port, host);

  if (json) {
    printJson(entry);
    return;
  }

  if (!health) {
    warn(`Server started (pid ${entry.pid}) but the health check did not pass.\nCheck logs: ${entry.logFile}`);
    return;
  }

  ok(`OMPChamber ${mode} server ready`);
  log(`  url:   ${entry.url}`);
  log(`  pid:   ${entry.pid}`);
  log(`  logs:  ${entry.logFile}`);
}

function runForeground({ pkgRoot, mode, port, host, quiet }) {
  const { file, args, env } = buildServeInvocation({ pkgRoot, mode, port, host, launchMode: 'foreground' });
  const url = `http://${probeHost(host)}:${port}`;
  if (!quiet) {
    log(`Running OMPChamber (${mode}) in the foreground on ${url} (Ctrl+C to stop)...`);
  }
  const child = Bun.spawn({
    cmd: [file, ...args],
    cwd: pkgRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env,
  });
  wireChildProcessLifecycle(child, process, 5000);
  return new Promise((resolve) => {
    void child.exited.then(resolve);
  });
}
