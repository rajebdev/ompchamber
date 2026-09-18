/**
 * Dev-only asset fallback for the rsbuild dev server.
 *
 * `writeToDisk` puts every emitted asset in `dist/client`, so `tryServeStatic`
 * covers normal requests. HMR artifacts do not reach disk: per-update
 * `*.hot-update.*` chunks and manifests are emitted in-memory only, and they
 * are requested on the page origin (port 3000) even though only the rsbuild
 * dev server (port 3100) can answer them. Without this proxy the manifest
 * fetch returns the HTML shell, `response.json()` throws, and the HMR runtime
 * falls back to a full page reload — forever.
 *
 * A 404 from rsbuild is relayed as-is: the runtime treats it as "no update
 * available" and stays idle, which is the correct steady state. This runs
 * after the disk lookup, so a missing rsbuild dev server costs one failed
 * connection per absent asset and nothing else.
 */
const DEV_SERVER = Bun.env.OMPCHAMBER_DEV_SERVER ?? 'http://localhost:3100';

const isDev = Bun.env.NODE_ENV !== 'production';

const isHmrArtifact = (pathname: string) => pathname.endsWith('.hot-update.json') || pathname.endsWith('.hot-update.js');

/** Streamed dev asset for `pathname`, or null when the app should handle it. */
export async function tryProxyDevAsset(request: Request, pathname: string): Promise<Response | null> {
  const proxied = isDev && (isHmrArtifact(pathname) || pathname.startsWith('/static/'));
  if (!proxied) return null;

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
  if (!upstream.body) return null;

  // Relay the upstream status: rsbuild's 404 for a stale manifest is the HMR
  // runtime's "no update" signal and must not become a 200 HTML shell.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store',
    },
  });
}
