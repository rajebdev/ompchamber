// `ompchamber restart` — stop live instances, then serve again.
//
// Scoping matches `status` and `stop`: without `--port` every live instance is
// restarted on its own recorded port/host/mode, and `--port <port>` restricts
// the restart to that one. With nothing running, the command is simply `serve`.
//
// Instances the CLI did not start are left alone, exactly as `ompchamber update`
// leaves them: `bun run dev` and `bun run start` own their own process, so
// replacing it would break a loop OMPChamber does not manage. `ompchamber stop`
// is still the deliberate way to end one.

import { findLiveInstance, listLiveInstances, stopInstance } from '@/cli/lib/runtime.js';
import { STOP_TIMEOUT_MS } from '@/cli/lib/process-lifecycle.js';
import { log, isJson, isQuiet } from '@/cli/lib/output.js';
import { run as runServe } from '@/cli/lib/commands/serve.js';
import { isAutoRestartable, skipRestartNote } from '@/server/lib/lifecycle/restart';

function explicitPort(options) {
  const raw = options?.port;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function run(options, ctx) {
  const json = isJson();
  const quiet = isQuiet();
  const requested = explicitPort(options);

  const targets = requested !== null
    ? [await findLiveInstance(requested)].filter(Boolean)
    : await listLiveInstances();

  if (targets.length === 0) return runServe(options, ctx);

  for (const live of targets) {
    if (!isAutoRestartable(live.launchMode)) {
      if (!json && !quiet) log(`Skipping OMPChamber on port ${live.port}: ${skipRestartNote(live.launchMode)}.`);
      continue;
    }

    if (!json && !quiet) log(`Stopping OMPChamber on port ${live.port} (pid ${live.pid})...`);
    await stopInstance(live, { timeoutMs: STOP_TIMEOUT_MS });

    // Reuse the recorded port/host/mode so an instance started on a non-default
    // port, or bound to the LAN, comes back the way it was found.
    await runServe(
      {
        ...options,
        port: live.port,
        host: live.host,
        lan: live.host === '0.0.0.0',
        prod: live.mode === 'prod',
        foreground: false,
        all: false,
      },
      ctx,
    );
  }
}
