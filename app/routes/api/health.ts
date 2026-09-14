import { json } from '@remix-run/node';
import pkg from '@/../package.json';
import { isMockMode } from '@/mock.server';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

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
      node: process.version,
    },
    { headers: NO_STORE },
  );
}
