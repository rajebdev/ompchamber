import { Elysia } from 'elysia';
import { apiRoutes } from '@/server/routes';
import { ssrRoutes } from '@/server/plugins/ssr';

const port = Number(Bun.env.PORT) || 3000;
const host = Bun.env.HOST || 'localhost';

const app = new Elysia().use(apiRoutes).use(ssrRoutes);

await app.listen({ port, hostname: host });

console.log(`[ompchamber] listening on http://${host}:${port}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.stop();
    process.exit(0);
  });
}
