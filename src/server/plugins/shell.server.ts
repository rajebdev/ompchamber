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

import { SHELL_ROUTE } from '@/server/lib/lifecycle/shell-route';
import { listenerUrl } from '@/server/lib/lifecycle/listener';

export type ShellRender = { ok: true; html: string } | { ok: false; reason: string };

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
    const response = await fetch(new URL(SHELL_ROUTE, base));
    if (!response.ok) return { ok: false, reason: `Shell route answered ${response.status}.` };
    return { ok: true, html: await response.text() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }
}
