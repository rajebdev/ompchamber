/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one CSS loader for every bundler pass Bun runs for this app.
 *
 * Bun's `serve.static` plugins and `Bun.build`'s `plugins` array both feed the
 * client bundle, and both need the same two transforms — so they live in ONE
 * plugin rather than two. `onLoad({ filter: /\.css$/ })` has a single winner per
 * module: whichever plugin returns contents first ends the chain, so two
 * plugins would silently starve each other (Tailwind's `@theme` blocks would
 * survive untouched, or the fonts would keep their unresolvable urls).
 *
 * 1. **Tailwind v4** — `@import "tailwindcss"` and `@theme` are PostCSS syntax,
 *    not CSS. Bun's CSS parser logs `invalid @ rule encountered: '@theme'` and
 *    emits the file verbatim, which costs every utility class in the app. The
 *    project's own `@tailwindcss/postcss` (the same version the previous bundler drove)
 *    expands them here.
 *
 * 2. **`@font-face` extraction** — a font face names a file inside
 *    `node_modules`, and Bun's CSS loader resolves EVERY local `url()`: with the
 *    default `file` loader it inlines the font as base64 (a 592 kB stylesheet,
 *    ~377 kB gzipped, every face downloaded whether or not a formula renders)
 *    and with `dataurl` it writes the ABSOLUTE FILESYSTEM PATH into the CSS. A
 *    same-origin path is not an escape hatch either — `url("/fonts/x.woff2")`
 *    fails the build with "Could not resolve". Measured against Bun 1.4.2: only
 *    `data:`, `http(s):` and protocol-relative urls are left alone, so no
 *    rewrite inside the bundle can work.
 *
 *    The faces therefore leave the bundle. Each block is rewritten to
 *    `<FONT_ROUTE_PREFIX><basename>` and written to its own file under
 *    `FONT_FACE_DIR`, keyed by the stylesheet it came from — a document Bun
 *    never parses, which is what lets the urls survive. The server concatenates
 *    that directory into `/fonts.css` (`lib/assets/font-css.server.ts`) and the
 *    shell links it, so the layout rules stay bundled while the faces stay
 *    cacheable files.
 *
 *    Per-source files rather than one accumulated file because `onEnd` is NOT
 *    invoked by `serve.static` (verified: `onStart` and `onLoad` fire, `onEnd`
 *    never does), so there is no "build finished" moment to flush at. Writing
 *    each source's faces as its `onLoad` returns is order-independent and works
 *    identically under both entry points.
 */

import { basename, dirname, isAbsolute, join, resolve as resolvePath } from 'path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import type { BunPlugin } from 'bun';

import { FONT_FACE_DIR } from '@/server/lib/assets/font-css.server';
import { FONT_ROUTE_PREFIX, packageRoot } from '@/server/lib/assets/fonts.server';

/** A `url(...)` whose target is a font file. */
const URL_FUNCTION = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const FONT_FILE = /\.(?:woff2?|ttf|otf)$/i;
/** Schemes Bun leaves alone, and the prefix this plugin itself emits. */
const EXTERNAL = /^(?:data:|https?:|blob:|\/\/)/i;

/** One `@font-face` block, braces included. Faces cannot nest. */
const FONT_FACE = /@font-face\s*\{[^{}]*\}/g;

/** Absolute path of a local font url, or null when it is not one. */
function localFont(specifier: string, cssDir: string): string | null {
  if (EXTERNAL.test(specifier) || specifier.startsWith(FONT_ROUTE_PREFIX)) return null;
  if (!FONT_FILE.test(specifier)) return null;
  return isAbsolute(specifier) ? specifier : resolvePath(cssDir, specifier);
}

/** Point every font `url()` at the served path. */
function rewriteFontUrls(css: string, cssDir: string): string {
  return css.replace(URL_FUNCTION, (whole, quote: string, specifier: string) => {
    const absolute = localFont(specifier, cssDir);
    if (!absolute) return whole;
    return `url(${quote}${FONT_ROUTE_PREFIX}${basename(absolute)}${quote})`;
  });
}

/**
 * Split `@font-face` blocks out of a stylesheet.
 *
 * Only blocks whose `src` names a local font move: a face pointing at a remote
 * url is valid CSS the bundle can keep.
 */
function splitFontFaces(css: string, cssDir: string): { rest: string; faces: string[] } {
  const faces: string[] = [];
  const rest = css.replace(FONT_FACE, (block) => {
    const hasLocal = [...block.matchAll(URL_FUNCTION)].some(([, , spec]) => localFont(spec, cssDir));
    if (!hasLocal) return block;
    faces.push(rewriteFontUrls(block, cssDir));
    return '';
  });
  return { rest, faces };
}

const plugin: BunPlugin = {
  name: 'ompchamber-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      // Tailwind first: it parses `@import "tailwindcss"` and `@theme`, and the
      // urls it emits are the ones the extraction below has to recognise.
      const expanded = await postcss([tailwind()]).process(source, { from: args.path });
      const { rest, faces } = splitFontFaces(expanded.css, dirname(args.path));
      if (faces.length > 0) {
        const target = join(packageRoot(), FONT_FACE_DIR, `${basename(args.path)}`);
        const header = `/* GENERATED from ${args.path} — do not edit. */\n`;
        await Bun.write(target, header + faces.join('\n') + '\n');
      }
      return { contents: rest, loader: 'css' };
    });
  },
};

export default plugin;
