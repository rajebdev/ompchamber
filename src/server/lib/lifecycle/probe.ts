/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Port occupancy probing.
 *
 * Availability is decided by *attempting a bind*, not by inspecting a PID file.
 * That matters on Bun: `Bun.serve` — and therefore Elysia's `listen`, which
 * hardcodes `reusePort: true` — lets a second process bind a port already in
 * use, so the only reliable question a starter can ask the OS is "can I bind
 * this?" (`net.createServer` never sets SO_REUSEPORT, so a second bind fails as
 * it should, regardless of who is already listening).
 */

import net from 'net';

const HEALTH_TIMEOUT_MS = 1500;

/**
 * Address a local probe should use for a bind host.
 *
 * `0.0.0.0`/`::` are bind-any addresses and cannot be connected to; loopback is
 * the address that reaches the same listener.
 */
export function probeHost(host?: string | null): string {
  const value = (host ?? '').trim();
  if (value.length === 0 || value === '0.0.0.0' || value === '::' || value === '[::]') return '127.0.0.1';
  return value;
}

/**
 * True when `port` can still be bound on `host`.
 *
 * The probe binds *the same address the server will bind* — a wildcard server
 * is probed with a wildcard bind. Probing loopback instead would ask a
 * different question: `net` sets SO_REUSEADDR, so a loopback bind can succeed
 * while `0.0.0.0:<port>` is already taken, and the port would look free right
 * up until the real `listen` failed.
 */
export async function isPortAvailable(port: number, host?: string | null): Promise<boolean> {
  if (!Number.isFinite(port) || port <= 0) return false;
  const bindHost = (host ?? '').trim() || 'localhost';
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const probe = net.createServer();
  probe.unref();
  probe.once('error', () => resolve(false));
  probe.listen({ port, host: bindHost }, () => {
    probe.close(() => resolve(true));
  });
  return await promise;
}

/** Poll until the port can be bound, or the deadline passes. */
export async function waitForPortFree(
  port: number,
  host: string | null | undefined,
  timeoutMs: number,
  intervalMs = 150,
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    if (await isPortAvailable(port, host)) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(intervalMs);
  }
}

export interface HealthPayload {
  service: string;
  pid?: number;
  version?: string;
  startedAt?: string;
  uptime?: number;
  mock?: boolean;
  runtime?: string;
  mode?: string;
  port?: number;
  host?: string;
}

/**
 * `GET /api/health` for an OMPChamber listener, or null.
 *
 * Only payloads that identify themselves as OMPChamber are returned — every
 * caller here is asking "is an OMPChamber server on this port", so a foreign
 * HTTP service answers null rather than a half-trusted object.
 */
export async function fetchHealth(
  port: number,
  host?: string | null,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<HealthPayload | null> {
  if (!Number.isFinite(port) || port <= 0) return null;
  try {
    const response = await fetch(`http://${probeHost(host)}:${port}/api/health`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return null;
    const payload = body as Record<string, unknown>;
    if (payload.service !== 'ompchamber') return null;
    return {
      service: 'ompchamber',
      pid: typeof payload.pid === 'number' ? payload.pid : undefined,
      version: typeof payload.version === 'string' ? payload.version : undefined,
      startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : undefined,
      uptime: typeof payload.uptime === 'number' ? payload.uptime : undefined,
      mock: typeof payload.mock === 'boolean' ? payload.mock : undefined,
      runtime: typeof payload.runtime === 'string' ? payload.runtime : undefined,
      mode: typeof payload.mode === 'string' ? payload.mode : undefined,
      port: typeof payload.port === 'number' ? payload.port : undefined,
      host: typeof payload.host === 'string' ? payload.host : undefined,
    };
  } catch {
    return null;
  }
}
