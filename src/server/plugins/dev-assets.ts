/**
 * Dev-only asset fallback for the rsbuild dev server.
 *
 * `writeToDisk` puts every emitted asset in `dist/client`, so `tryServeStatic`
 * covers normal requests. Assets rsbuild only generates per update — the
 * `*.hot-update.js` chunks behind HMR — never reach disk, and without them the
 * HMR runtime cannot swap a module and falls back to a full page reload.
 *
 * This runs after the disk lookup, so a missing rsbuild dev server costs one
 * failed connection per absent asset and nothing else.
 */
const DEV_SERVER = Bun.env.OMPCHAMBER_DEV_SERVER ?? 'http://localhost:3100';

const isDev = Bun.env.NODE_ENV !== 'production';

/** Streamed dev asset for `pathname`, or null when the app should handle it. */
export async function tryProxyDevAsset(request: Request, pathname: string): Promise<Response | null> {
  if (!isDev || !pathname.startsWith('/static/')) return null;

  const { search } = new URL(request.url);
  let upstream: Response;
  try {
    upstream = await fetch(`${DEV_SERVER}${pathname}${search}`, {
      method: request.method,
      headers: { accept: request.headers.get('accept') ?? '*/*' },
    });
  } catch {
    return null;
  }
  if (!upstream.ok || !upstream.body) return null;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store',
    },
  });
}
