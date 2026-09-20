// `ompchamber serve` — start the Remix dev or production server.

import { joinPath } from '@/cli/lib/path-utils.js';
import {
  spawnDetachedServer,
  buildServeInvocation,
  waitForHealth,
  findLiveInstance,
  probeHost,
} from '@/cli/lib/runtime.js';
import { log, ok, warn, fail, printJson, isJson, isQuiet } from '@/cli/lib/output.js';
import { wireChildProcessLifecycle } from '@/cli/lib/process-lifecycle.js';

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
    fail(`An OMPChamber instance is already running on port ${port} (pid ${existing.pid}).\nUse \`ompchamber restart\` or a different \`--port\`.`);
  }

  if (options?.foreground) {
    return runForeground({ pkgRoot, mode, port, host, quiet });
  }

  const { entry } = spawnDetachedServer({ pkgRoot, mode, port, host });

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
  const { file, args, env } = buildServeInvocation({ pkgRoot, mode, port, host });
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
