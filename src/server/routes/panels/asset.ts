/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `GET /api/panels/file/:slug/*` — one file from a panel plugin's own
 * directory, at a URL that is a real base for the plugin's relative links.
 *
 * This route is the security boundary for plugin code. A panel runs in an
 * iframe with an opaque origin, so it cannot fetch these bytes with the page's
 * credentials; the frame loads them as subresources, and its own CSP is what
 * narrows that to its own directory.
 *
 * Three rules are load-bearing:
 *
 * - The plugin is named by a SLUG (`<pluginId>~<panelId>`), and the directory
 *   comes from the REGISTRY. A request can therefore only ever name a file
 *   inside an installed plugin — the caller never supplies a path root.
 * - The resolved path must stay under that root, which refuses a `../` segment
 *   even if a manifest was hand-written to contain one. The scan rejects such a
 *   manifest too, so this is defence in depth rather than the only guard.
 * - The URL is shaped so a plugin's own relative URLs work: the path segment
 *   after the slug IS the file path, so `./main.js` and `../shared/x.css`
 *   resolve here without the plugin knowing anything about the chamber.
 */

import { extname } from 'path';
import { json, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { findPanelDirBySlug } from '@/server/lib/panels/registry.server';
import { pathExists } from '@/server/lib/omp/core/paths';
import { panelSdkSource } from '@/shared/lib/panels/protocol';
import { resolveInsideRoot } from '@/shared/lib/panels/resolve-asset';

/**
 * A panel's assets are text and images. Fonts are allowed because a panel that
 * ships its own UI plausibly ships a face with it; anything else is refused by
 * type rather than served as an opaque download.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * Compose a plugin's HTML document.
 *
 * The SDK must run before the plugin's own script, and the frame's CSP must be
 * in place before anything parses, so both are injected server-side rather than
 * patched in from the host after load — a document that has already run its own
 * first line is too late for either. Injection is a string insert, not a parse:
 * the markup is third-party and rewriting it through a parser would change it.
 *
 * The CSP is deliberately narrow: the frame's origin is opaque, so `'self'`
 * would match nothing and the chamber's own origin has to be named. That is
 * what lets a plugin load its sibling files from the asset route while refusing
 * every remote host.
 */
function composeEntryDocument(html: string, sdk: string, origin: string): string {
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${origin}`,
    `style-src 'unsafe-inline' ${origin}`,
    `img-src data: blob: ${origin}`,
    `font-src data: ${origin}`,
    `connect-src ${origin}`,
  ].join('; ');
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp}"><script>${sdk}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => match + head);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  return `<!doctype html><head>${head}</head>${html}`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const slug = params.slug ?? '';
  const rel = (params['*'] ?? '').replace(/^\/+/, '');
  if (!slug || !rel) return json({ error: 'Not found' }, { status: 404 });

  const pluginDir = await findPanelDirBySlug(slug);
  if (!pluginDir) return json({ error: `Unknown panel: ${slug}` }, { status: 404 });

  const target = resolveInsideRoot(pluginDir, rel);
  if (!target) return json({ error: 'Path escapes the plugin directory' }, { status: 403 });

  const contentType = CONTENT_TYPES[extname(target).toLowerCase()];
  if (!contentType) return json({ error: `Unsupported asset type: ${extname(target) || '(none)'}` }, { status: 415 });
  if (!(await pathExists(target))) return json({ error: `Asset not found: ${rel}` }, { status: 404 });

  const file = Bun.file(target);
  if (file.size > MAX_ASSET_BYTES) return json({ error: 'Asset is too large to serve' }, { status: 413 });

  const common = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // A panel's frame has an opaque origin, so a `fetch` for its OWN data files
    // is cross-origin and would fail without this. Only plugin assets are
    // served here — static files the user installed — so allowing any origin to
    // read them gives away nothing that is not already on disk in the clear.
    'access-control-allow-origin': '*',
  };

  // Only a document gets the SDK and the CSP. Injecting into a `.js` would
  // corrupt it, and injecting into an `.svg` would change what an `<img>`
  // renders.
  if (contentType.startsWith('text/html')) {
    const composed = composeEntryDocument(await file.text(), panelSdkSource(), origin);
    return new Response(composed, {
      headers: { ...common, 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(file, {
    headers: { ...common, 'content-type': contentType, 'content-length': String(file.size) },
  });
}
