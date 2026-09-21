// `ompchamber status` — report the live instances, their health and log paths.
//
// Without `--port` every live instance is reported: a CLI server on one port, a
// `bun run dev` server on another and a production server on a third are three
// separate processes, and a status command that showed only the first would
// hide the two you forgot about. `--port <port>` narrows the report to that
// instance.

import { findLiveInstance, listLiveInstances, waitForHealth } from '@/cli/lib/runtime.js';
import { probeHost } from '@/server/lib/lifecycle/probe';
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

/** One block per instance; the field names match the single-instance output. */
function printInstance(entry) {
  log(`  instance: ${entry.port}`);
  log(`  pid:      ${entry.pid}`);
  log(`  port:     ${entry.port}`);
  log(`  url:      ${entry.url ?? `http://${probeHost(entry.host)}:${entry.port}`}`);
  log(`  mode:     ${entry.mode ?? 'unknown'}`);
  log(`  launch:   ${entry.launchMode ?? 'unknown'}${entry.source ? ` (${entry.source})` : ''}`);
  log(`  uptime:   ${formatUptime(entry.startedAt)}`);
  log(`  health:   ${formatHealth(entry.health)}`);
  log(`  log:      ${entry.logFile}`);
}

export async function run(options) {
  const json = isJson();
  const requested = explicitPort(options);

  const instances = requested !== null
    ? [await findLiveInstance(requested)].filter(Boolean)
    : await listLiveInstances();

  if (instances.length === 0) {
    if (json) {
      printJson(requested !== null ? { running: false, port: requested } : { running: false, instances: [] });
      return;
    }
    log(requested !== null ? `No OMPChamber instance on port ${requested}.` : 'OMPChamber is not running.');
    return;
  }

  const reported = [];
  for (const entry of instances) {
    reported.push({ ...entry, health: await waitForHealth(entry.port, entry.host, 4000) });
  }

  if (json) {
    printJson(requested !== null ? { ...reported[0], running: true } : { running: true, instances: reported });
    return;
  }

  ok(reported.length === 1 ? 'OMPChamber is running' : `OMPChamber is running — ${reported.length} instances`);
  for (const [index, entry] of reported.entries()) {
    if (index > 0) log('');
    printInstance(entry);
  }
}
