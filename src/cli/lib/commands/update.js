// `ompchamber update` — replace this install with the latest GitHub release.
//
// The installation mechanics live in the shared update engine so the CLI and
// the console's "Update" button do the same thing; this command owns the
// terminal presentation and restarts the instances still serving the previous
// build (the ones the CLI started — a server running from source is left to its
// own launcher).

import { color, configure, error, log, ok, warn, printJson, isJson, isQuiet } from '@/cli/lib/output.js';
import { listLiveInstances, findLiveInstance, stopInstance } from '@/cli/lib/runtime.js';
import { STOP_TIMEOUT_MS } from '@/cli/lib/process-lifecycle.js';
import { run as runServe } from '@/cli/lib/commands/serve.js';
import { skipRestartNote } from '@/server/lib/lifecycle/restart';
import { isCliManaged } from '@/server/lib/lifecycle/launch-mode';
import { resolveInstallContext, resolveOmpChamberVersion, updateOmpChamber } from '@/server/lib/updates/install';

/**
 * Live instances to restart after an update: every one with `--all`, otherwise
 * the first. Their recorded port/host/mode is reused, so a server started on a
 * non-default port comes back on that same port. Instances started outside the
 * CLI (`bun run dev`, `bun run start`, a supervisor) are reported and left
 * running — their own launcher is what applies the new files.
 */
async function liveInstances(options) {
  if (options?.all) return await listLiveInstances();
  const live = await findLiveInstance(null);
  return live ? [live] : [];
}

async function restartInstances(options, ctx) {
  const restarted = [];
  const skipped = [];
  for (const entry of await liveInstances(options)) {
    if (!isCliManaged(entry.launchMode)) {
      skipped.push({ port: entry.port, pid: entry.pid, launchMode: entry.launchMode });
      log(`Skipping OMPChamber on port ${entry.port}: ${skipRestartNote(entry.launchMode)}.`);
      continue;
    }

    log(`Restarting OMPChamber on port ${entry.port} (pid ${entry.pid})...`);
    await stopInstance(entry, { timeoutMs: STOP_TIMEOUT_MS });
    await runServe(
      {
        ...options,
        port: entry.port,
        host: entry.host,
        lan: entry.host === '0.0.0.0',
        prod: entry.mode === 'prod',
        foreground: false,
        all: false,
      },
      ctx,
    );
    restarted.push(entry.port);
  }
  return { restarted, skipped };
}

async function runCheck(pkgRoot, json) {
  const info = await resolveOmpChamberVersion(pkgRoot);
  const context = resolveInstallContext(pkgRoot);

  if (json) {
    printJson({
      current: info.current,
      latest: info.latest,
      updateAvailable: info.updateAvailable,
      installed: true,
      method: context.method,
      reason: context.reason,
      error: info.error,
      releaseUrl: info.release?.url ?? null,
    });
  } else {
    log(`Current version: ${info.current ?? 'unknown'}`);
    if (info.updateAvailable) {
      log(color.yellow(`New version available: ${info.latest}`));
    } else if (!info.error) {
      ok('Already up to date');
    }
    if (info.error) warn(info.error);
  }

  if (info.error) process.exitCode = 1;
}

export async function run(options, ctx) {
  const json = isJson();
  const quiet = isQuiet();
  const pkgRoot = ctx?.pkgRoot ?? process.cwd();
  const force = Boolean(options?.force);
  const shouldRestart = options?.restart !== false;
  const onStage = quiet || json ? undefined : (label) => process.stdout.write(`${color.dim(`\u203a ${label}...`)}\n`);
  const onLine = quiet || json ? undefined : (chunk) => process.stdout.write(chunk);

  if (options?.check) {
    return runCheck(pkgRoot, json);
  }

  const result = await updateOmpChamber({ force, pkgRoot, onStage, onLine });

  if (json) {
    // Restarting prints through the serve command; silence it so stdout stays
    // one JSON document.
    if (result.success && result.updated && shouldRestart) configure({ json: false, quiet: true });
    const { restarted, skipped } = result.success && result.updated && shouldRestart
      ? await restartInstances(options, ctx)
      : { restarted: [], skipped: [] };
    printJson({ ...result, restarted, skipped });
    if (!result.success) process.exitCode = 1;
    return;
  }

  if (!result.success) {
    (result.manual ? warn : error)(result.message);
    process.exitCode = 1;
    return;
  }

  ok(result.message);
  if (!result.updated) return;

  if (!shouldRestart) {
    log('Restart the server to apply it: `ompchamber restart`.');
    return;
  }

  const { restarted, skipped } = await restartInstances(options, ctx);
  if (restarted.length === 0 && skipped.length === 0) {
    log('No running instance to restart.');
  }
}
