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
 * The server reference is injected rather than imported to avoid a cycle:
 * `index.ts` owns the listener and imports `ssrRoutes`, which reaches here.
 */

import { SHELL_ROUTE } from '@/server/lib/lifecycle/shell-route';

type ShellSource = { url: URL } | null;

let source: ShellSource = null;

/** Called by the server entry once its listener is up. */
export function setShellSource(server: { url: URL }): void {
  source = server;
}

export type ShellRender = { ok: true; html: string } | { ok: false; reason: string };

/**
 * The current shell markup, or a reason it could not be produced.
 *
 * Never cached: Bun re-renders the route per request in development, and in
 * production the manifest is already in memory — a cache here would be the one
 * thing that could serve markup pointing at a previous build's asset hashes.
 */
export async function renderShell(): Promise<ShellRender> {
  if (!source) return { ok: false, reason: 'The HTTP listener is not up yet.' };
  try {
    const response = await fetch(new URL(SHELL_ROUTE, source.url));
    if (!response.ok) return { ok: false, reason: `Shell route answered ${response.status}.` };
    return { ok: true, html: await response.text() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }
}
