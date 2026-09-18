import { Elysia } from 'elysia';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/server/db.server';
import { tryServeStatic } from '@/server/plugins/static';
import { tryProxyDevAsset } from '@/server/plugins/dev-assets';

const CLIENT_INDEX = join(process.cwd(), 'dist/client/index.html');

let cachedTemplate: string | null = null;
let cachedMtimeMs = 0;

/**
 * Cached, but invalidated on mtime so `rsbuild build --watch` (the dev loop)
 * picks up a new asset manifest without restarting the server.
 */
async function readTemplate(): Promise<string> {
  if (!existsSync(CLIENT_INDEX)) {
    throw new Error(`Client build not found at ${CLIENT_INDEX}. Run \`bun run build\` first.`);
  }
  const { mtimeMs } = statSync(CLIENT_INDEX);
  if (cachedTemplate !== null && mtimeMs === cachedMtimeMs) return cachedTemplate;
  cachedTemplate = await Bun.file(CLIENT_INDEX).text();
  cachedMtimeMs = mtimeMs;
  return cachedTemplate;
}

/** Actionable message instead of a bare 500 when the client build is absent. */
function missingBuildResponse(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>OMPChamber</title>
<body style="font:14px/1.6 ui-monospace,monospace;padding:2rem">
<h1 style="font-size:1.1rem">Client build not found</h1>
<p>The server needs <code>dist/client</code> before it can render pages.</p>
<pre style="background:#f4f1ea;padding:1rem;border-radius:6px">bun run build</pre>
<p>For a rebuild-on-change loop while developing:</p>
<pre style="background:#f4f1ea;padding:1rem;border-radius:6px">bunx rsbuild build --watch</pre>
</body>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    const db = await getDb();
    const rows = await db.all<{ key: string; value: string }>('SELECT * FROM app_settings');
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  } catch {
    return {};
  }
}

function themeColor(theme: string): string {
  return theme === 'one-dark-pro-soft' ? '#282c34' : '#faf8f3';
}

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

export const ssrRoutes = new Elysia({ name: 'ssr' }).get('*', async ({ request }) => {
  const pathname = new URL(request.url).pathname;

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const asset = tryServeStatic(pathname);
  if (asset) return asset;

  const devAsset = await tryProxyDevAsset(request, pathname);
  if (devAsset) return devAsset;

  if (!existsSync(CLIENT_INDEX)) return missingBuildResponse();

  const settings = await readSettings();
  const chamberSettings = (settings.omp_chamber_settings ?? {}) as { theme?: string };
  const theme = chamberSettings.theme ?? 'paper';
  const initialIsMobile = MOBILE_UA.test(request.headers.get('user-agent') ?? '');

  const template = await readTemplate();
  const bootstrap = JSON.stringify({ initialIsMobile, appSettings: settings }).replace(/</g, '\\u003c');

  return new Response(
    template
      .replace('data-theme="paper"', `data-theme="${theme}"`)
      .replace('<!--app-head-->', `<meta name="theme-color" content="${themeColor(theme)}">`)
      .replace('<!--app-bootstrap-->', `<script>window.__OMP_BOOTSTRAP__=${bootstrap}</script>`),
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
});
