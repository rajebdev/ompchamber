import { extname, join, normalize, resolve, sep } from 'path';

/**
 * File serving for `dist/client` (hashed, immutable) and `public/`.
 *
 * Hand-rolled rather than `@elysiajs/static`: that plugin registers its own
 * catch-all, which would shadow this app's SSR route. Exposing one lookup
 * function lets the web catch-all try a file first and fall back to the shell.
 */
const CLIENT_ROOT = resolve('dist/client');
const PUBLIC_ROOT = resolve('public');

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=3600';

// Only production output carries content hashes in its filenames. Dev output
// keeps stable names (`static/js/index.js`), so an immutable response there
// pins a stale bundle in the browser and the dev loop silently stops updating.
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

/** Roots searched for a non-`/static/` asset, in preference order. */
const PUBLIC_ROOTS = [PUBLIC_ROOT, CLIENT_ROOT] as const;

/**
 * The first readable copy of `pathname` under `roots`, or null.
 *
 * Non-`/static/` paths are the public assets (`icon.svg`, the web manifest, the
 * service worker, the touch icons). They exist twice: `public/` in a checkout
 * and `dist/client/` in the build — and only the latter ships, because
 * `package.json#files` lists `src`, `dist/client` and `tsconfig.json`. Serving
 * `public/` alone therefore 404s every one of them into the SSR shell when the
 * chamber runs from an installed package. The source folder is tried first so a
 * dev edit lands without a rebuild; the build output is the fallback. HTML is
 * excluded so `/index.html` keeps going through the SSR route that injects the
 * theme and bootstrap, and the cache stays short because these filenames carry
 * no content hash.
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
  if (pathname.startsWith('/static/')) {
    const filePath = resolveWithin(CLIENT_ROOT, pathname);
    return filePath ? serveFile(filePath, ASSET_CACHE) : null;
  }
  return servePublicAsset(pathname, PUBLIC_ROOTS);
}
