import { Elysia } from 'elysia';
import { join } from 'path';
import { getDb } from '@/server/db.server';
import { tryServeStatic } from '@/server/plugins/static';
import { tryProxyDevAsset } from '@/server/plugins/dev-assets';
import { resolveTheme } from '@/shared/lib/theme/catalog';
import { THEME_STYLE_ELEMENT_ID, themeStyleSheet } from '@/shared/lib/theme/css';

const CLIENT_INDEX = join(process.cwd(), 'dist/client/index.html');

let cachedTemplate: string | null = null;
let cachedMtimeMs = 0;

/**
 * Cached, but invalidated on mtime so `rsbuild build --watch` (the dev loop)
 * picks up a new asset manifest without restarting the server.
 */
async function readTemplate(): Promise<string> {
  const file = Bun.file(CLIENT_INDEX);
  if (!(await file.exists())) {
    throw new Error(`Client build not found at ${CLIENT_INDEX}. Run \`bun run build\` first.`);
  }
  const { mtimeMs } = await file.stat();
  if (cachedTemplate !== null && mtimeMs === cachedMtimeMs) return cachedTemplate;
  cachedTemplate = await file.text();
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
    { status: 503, headers: HTML_HEADERS },
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

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

/**
 * The HTML shell is generated per request, so its cacheability is declared
 * rather than left to the browser's heuristics.
 *
 * It is not a static file: the theme and the bootstrap settings are injected on
 * every request, and its only link to the bundle is a content hash inside the
 * markup. A copy that outlives its build does not merely go stale — it points at
 * an asset hash the build no longer emits, leaving the page running previous
 * code with nothing in the response to signal it.
 *
 * Chrome does not currently cache it: the response carries no `Cache-Control`,
 * `Last-Modified` or `ETag`, so there is no freshness to heuristically derive
 * and every navigation re-fetches (measured: a second load of the shell reported
 * the full 41 KB `transferSize`). That is the behaviour this header makes
 * explicit — the day a validator is added for the template, heuristic caching
 * would start and nothing else here would prevent it.
 *
 * `no-store` rather than `no-cache`: with no validator there is nothing to
 * revalidate against, so a stored copy is never usable.
 */
const SHELL_CACHE = 'no-store';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': SHELL_CACHE,
} as const;

export const ssrRoutes = new Elysia({ name: 'ssr' }).get('*', async ({ request }) => {
  const pathname = new URL(request.url).pathname;

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const asset = await tryServeStatic(pathname);
  if (asset) return asset;

  const devAsset = await tryProxyDevAsset(request, pathname);
  if (devAsset) return devAsset;

  if (!(await Bun.file(CLIENT_INDEX).exists())) return missingBuildResponse();

  const settings = await readSettings();
  const chamberSettings = (settings.omp_chamber_settings ?? {}) as { theme?: string };
  // Resolved through the catalog: an id this build no longer ships (a
  // downgrade, the retired `noir` alias) renders the default palette instead of
  // an unstyled page.
  const theme = resolveTheme(chamberSettings.theme);
  const initialIsMobile = MOBILE_UA.test(request.headers.get('user-agent') ?? '');

  const template = await readTemplate();
  const bootstrap = JSON.stringify({ initialIsMobile, appSettings: settings }).replace(/</g, '\\u003c');
  // The template's own `<meta name="theme-color">` is REWRITTEN, not joined by
  // a second tag: with both present Chrome reads the first one, so an appended
  // tag would leave a dark theme painting light browser chrome.
  const themeStyle = `<style id="${THEME_STYLE_ELEMENT_ID}">${themeStyleSheet()}</style>`;

  return new Response(
    template
      .replace('data-theme="paper"', `data-theme="${theme.id}"`)
      .replace('data-theme-variant="light"', `data-theme-variant="${theme.variant}"`)
      .replace('<meta name="theme-color" content="#faf8f3" />', `<meta name="theme-color" content="${theme.canvas}" />`)
      .replace('<!--app-head-->', themeStyle)
      .replace('<!--app-bootstrap-->', `<script>window.__OMP_BOOTSTRAP__=${bootstrap}</script>`),
    { headers: HTML_HEADERS },
  );
});
