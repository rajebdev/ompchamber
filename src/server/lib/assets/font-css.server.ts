/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The font stylesheet, assembled at request time.
 *
 * `@font-face` blocks cannot live in the bundle: Bun's CSS loader resolves every
 * local `url()`, and a font is always a local file — so a bundled face is either
 * a base64 blob or an absolute filesystem path. `lib/bundler/css.ts` lifts each
 * block out of its stylesheet and rewrites the urls to `<FONT_ROUTE_PREFIX><basename>`;
 * this module serves the result.
 *
 * Two jobs, one route each:
 *
 * - `FONT_STYLESHEET_ROUTE` (`/fonts.css`) concatenates the extracted faces.
 *   Read per request rather than cached: it is a handful of kilobytes, and a
 *   cache is what would keep a stale face alive across an edit to a stylesheet.
 *   A missing directory is an empty stylesheet, not a 404 — the shell links this
 *   unconditionally.
 *
 * - `FONT_ROUTE_PREFIX` (`/fonts/<basename>`) serves the file itself from the
 *   installed packages. The basename is the whole key, so the lookup is an index
 *   rather than a path built from the request; see `fonts.server.ts`.
 */

import { join } from 'path';
import { Glob } from 'bun';

import { packageRoot, resolveFontFile } from '@/server/lib/assets/fonts.server';

/** Directory holding one extracted face file per source stylesheet. */
export const FONT_FACE_DIR = join('.ompchamber-build', 'font-faces');

/** The route the assembled stylesheet is served on. */
export const FONT_STYLESHEET_ROUTE = '/fonts.css';

const FONT_MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const STYLESHEET_HEADERS = {
  'content-type': 'text/css; charset=utf-8',
  'cache-control': 'no-store',
} as const;

/** Every extracted face file, concatenated in a stable order. */
export async function fontStylesheet(): Promise<string> {
  const dir = join(packageRoot(), FONT_FACE_DIR);
  const glob = new Glob('*.css');
  const files: string[] = [];
  try {
    for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) files.push(file);
  } catch {
    return '';
  }
  // Sorted so the stylesheet is byte-stable between builds: the browser caches
  // on the ETag, and an unstable order would invalidate it for no change.
  files.sort();
  const parts = await Promise.all(files.map((file) => Bun.file(join(dir, file)).text()));
  return parts.join('\n');
}

/** The `/fonts.css` response. */
export async function serveFontStylesheet(): Promise<Response> {
  return new Response(await fontStylesheet(), { headers: STYLESHEET_HEADERS });
}

/** The `/fonts/<basename>` response, or null when no package ships that file. */
export async function serveFontFile(name: string): Promise<Response | null> {
  const file = await resolveFontFile(name);
  if (!file) return null;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return new Response(Bun.file(file), {
    headers: {
      'content-type': FONT_MIME[ext] ?? 'application/octet-stream',
      // A font's bytes never change under a fixed basename inside a pinned
      // dependency, so this is the one asset that can be cached hard.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
