// `ompchamber restart` — stop the live instance (if any), then serve again.

import { findLiveInstance, stopInstance } from '@/cli/lib/runtime.js';
import { STOP_TIMEOUT_MS } from '@/cli/lib/process-lifecycle.js';
import { log, isJson, isQuiet } from '@/cli/lib/output.js';
import { run as runServe } from '@/cli/lib/commands/serve.js';

function explicitPort(options) {
  const raw = options?.port;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function run(options, ctx) {
  const json = isJson();
  const quiet = isQuiet();
  const live = await findLiveInstance(explicitPort(options));

  if (live) {
    if (!json && !quiet) {
      log(`Stopping OMPChamber on port ${live.port} (pid ${live.pid})...`);
    }
    await stopInstance(live, { timeoutMs: STOP_TIMEOUT_MS });
  }

  return runServe(options, ctx);
}
