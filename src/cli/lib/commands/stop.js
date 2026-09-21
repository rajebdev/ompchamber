// `ompchamber stop` — stop one or every live OMPChamber instance.

import { listLiveInstances, findLiveInstance, stopInstance } from '@/cli/lib/runtime.js';
import { STOP_TIMEOUT_MS } from '@/cli/lib/process-lifecycle.js';
import { ok, warn, printJson, isJson } from '@/cli/lib/output.js';

function resolvePort(options) {
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
  return 3000;
}

function explicitPort(options) {
  const raw = options?.port;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function run(options) {
  const json = isJson();
  const requested = explicitPort(options);

  // No `--port` means every live instance: a CLI server, a dev run and a
  // production server are three processes, and `stop` without a port is the
  // command that clears all of them. `--all` is the explicit spelling of the
  // same default, kept because it reads well in scripts.
  let targets;
  if (requested !== null) {
    const live = await findLiveInstance(requested);
    targets = live ? [live] : [];
  } else {
    targets = await listLiveInstances();
  }

  if (targets.length === 0) {
    if (json) {
      printJson({ stopped: [] });
      return;
    }
    warn(requested === null
      ? 'No running OMPChamber instances found.'
      : `No running OMPChamber instance on port ${requested}.`);
    return;
  }

  const stopped = [];
  for (const entry of targets) {
    const gone = await stopInstance(entry, { timeoutMs: STOP_TIMEOUT_MS });
    stopped.push({ port: entry.port, pid: entry.pid, stopped: gone });
    if (json) continue;
    if (gone) {
      ok(`Stopped OMPChamber on port ${entry.port} (pid ${entry.pid}).`);
    } else {
      warn(`OMPChamber on port ${entry.port} (pid ${entry.pid}) did not exit cleanly.`);
    }
  }

  if (json) printJson({ stopped });
}
