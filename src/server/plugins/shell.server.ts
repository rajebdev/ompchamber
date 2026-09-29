/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The HTML shell, rendered by Bun's own HTML pipeline.
 *
 * The shell used to be a file the bundler wrote and the server read back
 * (`dist/client/index.html`). It is now a route Bun bundles and renders: the
 * `index.html` import carries a manifest of hashed assets, and fetching the
 * shell route returns that markup with the correct script and stylesheet tags
 * for the current build — which is also what keeps the dev HMR client injected.
 *
 * The round-trip through the local listener is deliberate. Bun renders an HTML
 * route only when serving it, and there is no API to render an `HTMLBundle` in
 * process: `new Response(bundle)` yields the string "[object HTMLBundle]" and
 * `app.handle('/_shell')` answers 404, because the route lives in `Bun.serve`'s
 * own routing table rather than Elysia's (verified against Bun 1.4.2). Fetching
 * our own listener is the supported way to obtain the markup.
 *
 * The listener reference is shared with the dev asset proxy, which needs the
 * same URL to reach the routes Bun's own table owns — see `lifecycle/listener`.
 */

import { describeShellBuildFailure } from '@/server/lib/bundler/build-errors.server';
import { SHELL_ROUTE } from '@/server/lib/lifecycle/shell-route';
import { listenerFetchOptions, listenerUrl } from '@/server/lib/lifecycle/listener';

export type ShellRender = { ok: true; html: string } | { ok: false; reason: string };

/**
 * Why the route refused, in the terms of the edit that broke it.
 *
 * A status alone is the least useful half of the answer: the route answers 500
 * because Bun could not bundle the page, and the file, line and message are in
 * the response — but only inside Bun's "Build Failed" page, which carries them
 * as a binary payload the page decodes at runtime. So the entrypoint is rebuilt
 * to obtain them in readable form. See `bundler/build-errors.server` for why
 * that probe agrees with the route.
 *
 * Runs only on a failure, on a page that is already broken.
 */
async function shellFailureReason(status: number, markupInvalid = false): Promise<string> {
  const detail = await describeShellBuildFailure();
  if (detail) {
    const reason = markupInvalid ? 'The shell route answered with markup that is not the shell.' : `Shell route answered ${status}.`;
    return `${reason}\n\nThe client bundle does not build:\n\n${detail}`;
  }
  // Markup that is not the shell while the bundle builds cleanly means the
  // route is serving a CACHED failure: Bun caches the HTML route's output once
  // in production and never rebuilds it, so the empty body a failed first
  // request left behind outlives the fix. There is nothing to point at in the
  // source, and no amount of reloading helps — only a restart does.
  return 'The shell route answered with markup that is not the shell, and the client bundle builds cleanly.\n\n'
    + 'In production Bun caches the HTML route\'s output, so a build failure on the first request is cached as an empty page. Restart the server to rebuild it.';
}

/**
 * The bootstrap marker the SSR route substitutes, and therefore the one string
 * that proves the markup came from `index.html`.
 *
 * A status check alone is not enough, and the gap is not theoretical: with
 * `development: false` Bun caches the route's output, and a build that failed on
 * the FIRST request leaves it caching an EMPTY body answered `200`. Every later
 * request then looks successful, and the substitution below finds nothing to
 * replace — so the browser gets a blank page with a 200 and no way to tell why.
 * Measured on Bun 1.4.2: request 1 `500` + empty, requests 2..n `200` + empty,
 * and it stayed empty after the source was fixed, because the cached output is
 * never rebuilt in production. The marker turns that into the same actionable
 * page the development path already produces.
 */
export const SHELL_MARKER = '<!--app-bootstrap-->';

/**
 * The current shell markup, or a reason it could not be produced.
 *
 * Never cached: Bun re-renders the route per request in development, and in
 * production the manifest is already in memory — a cache here would be the one
 * thing that could serve markup pointing at a previous build's asset hashes.
 */
export async function renderShell(): Promise<ShellRender> {
  const base = listenerUrl();
  if (!base) return { ok: false, reason: 'The HTTP listener is not up yet.' };
  try {
    // `listenerFetchOptions()` carries the TLS bypass under `--tls`: this is the
    // process asking its own listener, and its self-signed certificate would
    // otherwise fail the handshake and render "Shell not available" on every page.
    const response = await fetch(new URL(SHELL_ROUTE, base), listenerFetchOptions());
    if (!response.ok) return { ok: false, reason: await shellFailureReason(response.status) };
    const html = await response.text();
    if (!html.includes(SHELL_MARKER)) return { ok: false, reason: await shellFailureReason(response.status, true) };
    return { ok: true, html };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }
}
