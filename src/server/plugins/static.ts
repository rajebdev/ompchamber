import { extname, join, normalize, resolve, sep } from 'path';

import { FONT_STYLESHEET_ROUTE, serveFontFile, serveFontStylesheet } from '@/server/lib/assets/font-css.server';
import { FONT_ROUTE_PREFIX, packageRoot } from '@/server/lib/assets/fonts.server';

/**
 * File serving for `public/` and the font routes.
 *
 * The client bundle is NOT served from here any more. Bun's own routing owns
 * the assets it emits — `/_bun/asset/*` and `/_bun/client/*` in development,
 * `/chunk-*` in production — and answers them from its bundle table before a
 * request reaches Elysia. `dist/client` no longer exists, so the `/static/`
 * branch and its content-hashed caching went with it.
 *
 * Hand-rolled rather than `@elysiajs/static`: that plugin registers its own
 * catch-all, which would shadow this app's SSR route. Exposing one lookup
 * function lets the web catch-all try a file first and fall back to the shell.
 */
// Resolved from the package root, not the cwd: `serve --prod` may run the built
// server from anywhere, and a cwd-relative `public` would not exist — every
// icon, the manifest and the service worker would 404.
const PUBLIC_ROOT = resolve(packageRoot(), 'public');
/** Where `scripts/build-client.ts` writes the production bundle and its chunks. */
const CLIENT_ROOT = resolve(packageRoot(), 'dist', 'client');

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=3600';

// Production output carries content hashes in its filenames, so it can be
// cached hard. In development these paths are served by Bun's own table and
// this branch is not reached at all — a stable-name dev asset must never be
// pinned, which is why the distinction is kept here.
const ASSET_CACHE = Bun.env.NODE_ENV === 'production' ? IMMUTABLE : 'no-store';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveWithin(root: string, pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(join(root, normalize(decoded)));
  // Contain traversal: the resolved path must stay inside its root.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

async function serveFile(filePath: string, cacheControl: string): Promise<Response | null> {
  let stat;
  try {
    stat = await Bun.file(filePath).stat();
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const stream = Bun.file(filePath).stream();
  return new Response(stream, {
    headers: {
      'content-type': type,
      'content-length': String(stat.size),
      'cache-control': cacheControl,
      'last-modified': stat.mtime.toUTCString(),
    },
  });
}

/**
 * The first readable copy of `pathname` under `roots`, or null.
 *
 * Non-`/static/` paths are the public assets (`icon.svg`, the web manifest, the
 * service worker, the touch icons). HTML is excluded so `/index.html` keeps
 * going through the SSR route that injects the theme and bootstrap, and the
 * cache stays short because these filenames carry no content hash.
 */
export async function servePublicAsset(pathname: string, roots: readonly string[]): Promise<Response | null> {
  for (const root of roots) {
    const filePath = resolveWithin(root, pathname);
    if (!filePath || filePath.endsWith('.html')) continue;
    const response = await serveFile(filePath, SHORT);
    if (response) return response;
  }
  return null;
}

/** A file for `pathname`, or null when the request should reach the app. */
export async function tryServeStatic(pathname: string): Promise<Response | null> {
  // The production bundle's own assets. `scripts/build-client.ts` emits the
  // server into `dist/client` with its chunks under `dist/client/static`, and
  // the generated HTML references them as `./static/...` — a page URL of `/`
  // makes that `/static/...`, which is this branch. In development the same
  // files are served by Bun's own routing table (`/_bun/asset/*`,
  // `/_bun/client/*`) and never reach here.
  if (pathname.startsWith('/static/')) {
    const filePath = resolveWithin(CLIENT_ROOT, pathname);
    return filePath ? serveFile(filePath, ASSET_CACHE) : null;
  }
  // The extracted `@font-face` stylesheet and the files it names. Bun's CSS
  // loader cannot carry either — every local `url()` is resolved, so a bundled
  // face is base64 or an absolute path — which is why they are served rather
  // than emitted. Both live outside `public/`: the stylesheet is assembled from
  // the faces `lib/bundler/css.ts` wrote, and the files come from the installed
  // packages.
  if (pathname === FONT_STYLESHEET_ROUTE) return serveFontStylesheet();
  if (pathname.startsWith(FONT_ROUTE_PREFIX)) {
    return serveFontFile(decodeURIComponent(pathname.slice(FONT_ROUTE_PREFIX.length)));
  }
  return servePublicAsset(pathname, [PUBLIC_ROOT]);
}
