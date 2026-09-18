import { createReadStream, existsSync, statSync } from 'fs';
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

function serveFile(filePath: string, cacheControl: string): Response | null {
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  if (!stat.isFile()) return null;

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const stream = createReadStream(filePath) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'content-type': type,
      'content-length': String(stat.size),
      'cache-control': cacheControl,
      'last-modified': stat.mtime.toUTCString(),
    },
  });
}

/** A file for `pathname`, or null when the request should reach the app. */
export function tryServeStatic(pathname: string): Response | null {
  if (pathname.startsWith('/static/')) {
    const filePath = resolveWithin(CLIENT_ROOT, pathname);
    return filePath ? serveFile(filePath, IMMUTABLE) : null;
  }

  const publicPath = resolveWithin(PUBLIC_ROOT, pathname);
  if (!publicPath) return null;
  return serveFile(publicPath, SHORT);
}
