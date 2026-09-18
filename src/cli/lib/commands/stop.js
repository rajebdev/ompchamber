// `ompchamber stop` — stop one or every live OMPChamber instance.

import { listRegistries, findLiveInstance, isProcessAlive, stopInstance } from '@/cli/lib/runtime.js';
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

  let targets;
  if (options?.all) {
    targets = (await listRegistries()).filter((entry) => entry && isProcessAlive(Number(entry.pid)));
  } else {
    const live = await findLiveInstance(explicitPort(options));
    targets = live ? [live] : [];
  }

  if (targets.length === 0) {
    if (json) {
      printJson({ stopped: [] });
      return;
    }
    warn(options?.all
      ? 'No running OMPChamber instances found.'
      : `No running OMPChamber instance on port ${explicitPort(options) ?? resolvePort(options)}.`);
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
