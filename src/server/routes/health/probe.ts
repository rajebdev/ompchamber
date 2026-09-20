import { json, NO_STORE_HEADERS } from '@/server/lib/remix-compat';
import pkg from '@/../package.json';
import { isMockMode } from '@/server/mock.server';

const STARTED_AT = Date.now();
const STARTED_ISO = new Date(STARTED_AT).toISOString();

/**
 * GET /api/health — lightweight readiness probe for the `ompchamber status` CLI.
 * Dependency-light by design: never touches the database and never throws.
 */
export async function loader() {
  return json(
    {
      ok: true,
      service: 'ompchamber',
      version: pkg.version,
      pid: process.pid,
      uptime: Math.round((Date.now() - STARTED_AT) / 10) / 100,
      startedAt: STARTED_ISO,
      mock: isMockMode(),
      runtime: 'bun',
      bun: Bun.version,
    },
    { headers: NO_STORE_HEADERS },
  );
}
