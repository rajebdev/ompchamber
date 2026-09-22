import { json, NO_STORE_HEADERS } from '@/server/lib/remix-compat';
import pkg from '@/../package.json';
import { resolveLaunchMode } from '@/server/lib/lifecycle/launch-mode';
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
      // Identity of the listener itself, read by the CLI and by a starting
      // server deciding whether this port belongs to OMPChamber: `mode` and
      // `launchMode` are what `status` prints, and the pair with `pid` is what
      // separates a dev server from a stale published build.
      mode: Bun.env.NODE_ENV === 'production' ? 'prod' : 'dev',
      launchMode: resolveLaunchMode(),
      port: Number(Bun.env.PORT) || 3000,
      host: Bun.env.HOST || 'localhost',
    },
    { headers: NO_STORE_HEADERS },
  );
}
