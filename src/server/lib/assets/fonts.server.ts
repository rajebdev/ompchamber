/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Font files served straight from the installed packages.
 *
 * The client stylesheet reaches its `@font-face` sources through the bundler's
 * CSS loader (`lib/bundler/css.ts`), which rewrites every one of them to
 * `<FONT_ROUTE_PREFIX><basename>`. Nothing copies them into the repository: a
 * font is addressed by its own basename, and this module resolves that basename
 * back to the package that ships it.
 *
 * A directory index rather than a path built from the request, because the
 * request must never choose a directory. The index is built once, lazily, by
 * walking the vendor font directories, and a basename that is not in it is a
 * 404 rather than a lookup somewhere else.
 *
 * The search roots are not just `process.cwd()`. An installed package runs the
 * AOT bundle from `dist/client`, and a `serve --prod` started from another
 * directory has neither `node_modules` nor the source tree under it — so the
 * roots are every directory from the running module up to the filesystem root,
 * plus the cwd. Whichever one holds `node_modules` is the package root.
 */

import { existsSync } from 'fs';
import { basename, dirname, join, parse, resolve } from 'path';
import { Glob } from 'bun';

/** Path prefix every rewritten font url carries. */
export const FONT_ROUTE_PREFIX = '/fonts/';

/** Where the fonts live, relative to a package root. */
const FONT_SOURCES = [
  'node_modules/katex/dist/fonts',
  'node_modules/@fontsource/fira-code/files',
] as const;

/**
 * Directories a package root may be found under, nearest first.
 *
 * `import.meta.dir` is the running file's directory — the repo root for the
 * TypeScript entry, `dist/client` for the AOT bundle — and walking up from it
 * finds `node_modules` in both. The cwd is included because a source checkout
 * run from elsewhere still resolves its dependencies through it.
 */
function searchRoots(): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  const add = (dir: string) => {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      roots.push(dir);
    }
  };

  let dir = import.meta.dir;
  const { root } = parse(dir);
  for (;;) {
    add(dir);
    if (dir === root) break;
    dir = dirname(dir);
  }
  add(resolve(process.cwd()));
  return roots;
}

/** Basename -> absolute path. Built once; the packages do not change at runtime. */
let index: Record<string, string> | null = null;

/**
 * The package root — the first search root that holds `node_modules`.
 *
 * Both ends of the build need the same answer: the plugin writes the extracted
 * face files here and the server reads them back, and an AOT bundle runs from
 * `dist/client` while a source checkout runs from the repo. Falling back to the
 * cwd keeps a checkout with no `node_modules` (a publish dry-run) working.
 */
export function packageRoot(): string {
  for (const root of searchRoots()) {
    // `existsSync` rather than `Bun.file().exists()`: the latter is async and
    // file-only, and `node_modules` is a directory.
    if (existsSync(join(root, 'node_modules'))) return root;
  }
  return process.cwd();
}

async function buildIndex(): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const glob = new Glob('*.{woff2,woff,ttf,otf}');
  for (const root of searchRoots()) {
    for (const dir of FONT_SOURCES) {
      const from = join(root, dir);
      try {
        for await (const file of glob.scan({ cwd: from, onlyFiles: true })) {
          const name = basename(file);
          // Nearest root wins: a checkout's own node_modules is what its build
          // was made against, so it must not lose to a parent's copy.
          found[name] ??= join(from, file);
        }
      } catch {
        // A root without these packages contributes nothing; the CSS that
        // referenced a missing font will 404, which is the honest outcome.
      }
    }
  }
  return found;
}

/** The font file for a basename, or null when nothing ships it. */
export async function resolveFontFile(name: string): Promise<string | null> {
  // A basename only: a request for `../` or a nested path is not a font.
  if (!name || name !== basename(name)) return null;
  index ??= await buildIndex();
  return index[name] ?? null;
}
