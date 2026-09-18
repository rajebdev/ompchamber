// `ompchamber status` — report the live instance, its health and log path.

import { findLiveInstance, waitForHealth, probeHost } from '@/cli/lib/runtime.js';
import { log, ok, printJson, isJson } from '@/cli/lib/output.js';

function explicitPort(options) {
  const raw = options?.port;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUptime(startedAt) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return 'unknown';
  let seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatHealth(health) {
  if (!health) return 'unreachable';
  const version = health.version ?? 'unknown';
  const mock = health.mock ? ', mock' : '';
  return `ok (version ${version}${mock})`;
}

export async function run(options) {
  const json = isJson();
  const live = await findLiveInstance(explicitPort(options));

  if (!live) {
    if (json) {
      printJson({ running: false });
      return;
    }
    log('OMPChamber is not running.');
    return;
  }

  const health = await waitForHealth(live.port, live.host, 4000);
  const merged = { ...live, running: true, health };

  if (json) {
    printJson(merged);
    return;
  }

  ok('OMPChamber is running');
  log(`  instance: ${live.port}`);
  log(`  pid:      ${live.pid}`);
  log(`  port:     ${live.port}`);
  log(`  url:      ${live.url ?? `http://${probeHost(live.host)}:${live.port}`}`);
  log(`  mode:     ${live.mode ?? 'unknown'}`);
  log(`  uptime:   ${formatUptime(live.startedAt)}`);
  log(`  health:   ${formatHealth(health)}`);
  log(`  log:      ${live.logFile}`);
}
