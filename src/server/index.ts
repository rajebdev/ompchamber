import { Elysia } from 'elysia';
import { apiRoutes } from '@/server/routes';
import { ssrRoutes } from '@/server/plugins/ssr';
import { getDatabasePath } from '@/server/db.server';
import { fetchOmpRegistrySnapshot } from '@/server/lib/models/provider-registry.server';
import { ompStartupError, ompStartupLogLines } from '@/server/lib/omp/core/startup';
import { isMockMode } from '@/server/mock.server';

// Refuse to run without a resolvable omp binary — before the listener opens and
// before the first request can reach a route that shells out to it. The database
// is opened lazily by getDb(), so this exits without touching it.
const startupError = ompStartupError();
if (startupError) {
  console.error(startupError);
  process.exit(1);
}

// Which omp the chamber drives, which ~/.omp tree it reads and which SQLite file
// it writes — the paths every session/agent diagnostic traces back to. The data
// mode comes first because it changes what every later line means.
console.log(`[ompchamber] mock mode:      ${isMockMode() ? 'true (demo presets)' : 'false (real omp data)'}`);
for (const line of ompStartupLogLines()) console.log(`[ompchamber] ${line}`);
console.log(`[ompchamber] db:             ${await getDatabasePath()}`);

const port = Number(Bun.env.PORT) || 3000;
const host = Bun.env.HOST || 'localhost';

const app = new Elysia().use(apiRoutes).use(ssrRoutes);

await app.listen({ port, hostname: host });

// The listener is already accepting requests here, so the probe only postpones
// this last banner line, never startup. Printing it after the probe keeps the
// one line that matters — the URL — at the bottom of the log.
await logDetectedRegistry();

console.log(`[ompchamber] listening on http://${host}:${port}`);

/**
 * What omp reports it can actually run. A live RPC round-trip: a cold utility
 * process takes seconds, which is why it runs after the listener is up. Side
 * benefit — it warms the shared utility process the model picker drives, so the
 * first /api/models call does not pay the spawn.
 */
async function logDetectedRegistry(): Promise<void> {
  if (isMockMode()) {
    console.log('[ompchamber] providers:      n/a (MOCK mode)');
    console.log('[ompchamber] models:         n/a (MOCK mode)');
    return;
  }
  try {
    const { providers, models } = await fetchOmpRegistrySnapshot();
    // Count providers that actually serve a model — the distinct `provider`
    // values in the model list, i.e. the same set GET /api/models groups by.
    // omp's login catalog lists every sign-in offer it supports (75 here, 73 of
    // them without credentials); counting those would report a provider set the
    // chamber cannot use. The catalog size is kept as context.
    const servingProviders = new Set(models.map((model) => model.provider)).size;
    console.log(`[ompchamber] providers:      ${servingProviders} detected (${providers.length} known to omp)`);
    console.log(`[ompchamber] models:         ${models.length} detected`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[ompchamber] providers/models: detection failed — ${message}`);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.stop();
    process.exit(0);
  });
}
