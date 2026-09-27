/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Every bare import in `src/` must resolve from a published install.
 *
 * The bundler plugin (`css.ts`) is **runtime server code**, not build tooling:
 * `bunfig.toml` names it in `[serve.static].plugins`, so `Bun.serve` loads it
 * whenever an HTML route is bundled — which is every `ompchamber serve` in
 * development and every `bun run start`. It therefore has to be loadable from
 * an install that carries only `dependencies`.
 *
 * It was not. `@tailwindcss/postcss` was declared a devDependency and `postcss`
 * was declared nowhere at all, which no local run could reveal — a source
 * checkout and the developer's own `bun install` both have the whole tree — but
 * the published package does not. Measured against a production-only install of
 * the published tarball: the server came up and answered `503` on every page,
 * with `error: Failed to load plugins for Bun.serve: Cannot find package
 * 'postcss'` in its log and nothing in the shell to say why. The same install
 * from `bun add -g` failed one dependency later on `@tailwindcss/postcss`.
 *
 * The invariant is therefore: a module reachable from a runtime entry point may
 * only import a bare specifier that `dependencies` declares (or a Node/Bun
 * builtin). `devDependencies` is the wrong home for anything the running server
 * loads, however build-shaped it looks.
 *
 * Scope is deliberately `src/**` rather than "what the bundler reaches": the
 * published tarball ships all of `src` and the CLI executes from it too, so a
 * static import anywhere in the tree is a real requirement. Type-only imports
 * are excluded because `scanImports` erases them — they cost nothing at runtime.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

import { packageRoot } from '@/server/lib/assets/fonts.server';

/** Files whose imports are not part of any runtime path. */
const EXCLUDED = /\.test\.|\.test-util\.|test-util\./;

/** `@scope/name` keeps two segments; a bare package keeps one. */
function packageName(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

const BUILTINS = new Set(builtinModules);

/**
 * Resolved from the running module, not the cwd — the same helper the bundler
 * plugin uses, so this test answers the same question whether it is run from the
 * repo root, from `dist/client`, or through `bun test <path>` elsewhere.
 */
const ROOT = packageRoot();

const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const RUNTIME = new Set(Object.keys(pkg.dependencies ?? {}));
const DEV = new Set(Object.keys(pkg.devDependencies ?? {}));

/**
 * Bun's transpiler is the parser here, so the answer matches what the bundler
 * itself sees: `@/` aliases, relative paths and `node:`/`bun:` prefixes are
 * filtered below, and a type-only import never appears at all.
 */
const transpiler = new Bun.Transpiler({
  loader: 'tsx',
  tsconfig: readFileSync(join(ROOT, 'tsconfig.json'), 'utf8'),
});

const sources = [...new Bun.Glob('src/**/*.{ts,tsx,js}').scanSync({ cwd: ROOT })]
  .filter((file) => !EXCLUDED.test(file));

/** Every bare specifier each file imports, keyed by the file that imports it. */
async function bareImports(file: string): Promise<string[]> {
  let imports: Bun.Import[];
  try {
    imports = transpiler.scanImports(readFileSync(join(ROOT, file), 'utf8'));
  } catch {
    // A shebang line (`src/cli/ompchamber.js`) is not parseable as a module;
    // its imports are covered by the files it imports.
    return [];
  }
  return imports
    // `require-call` entries are the JSX runtime Bun injects into the scan, not
    // a specifier the source names; the runtime itself is `preact`, which is
    // declared.
    .filter((entry) => entry.kind !== 'require-call')
    .map((entry) => entry.path)
    .filter((path) => !path.startsWith('.') && !path.startsWith('@/'))
    .filter((path) => !path.startsWith('bun:') && !path.startsWith('node:'))
    .filter((path) => !BUILTINS.has(packageName(path)));
}

describe('runtime imports are declared as dependencies', () => {
  test('no shipped module imports a bare specifier the package does not declare', async () => {
    const violations: string[] = [];

    for (const file of sources) {
      for (const specifier of await bareImports(file)) {
        const name = packageName(specifier);
        if (RUNTIME.has(name)) continue;
        violations.push(`${file} imports '${specifier}' — ${DEV.has(name) ? 'declared in devDependencies' : 'not declared in package.json'}`);
      }
    }

    // Printed rather than merely counted: the fix is per-specifier, and the
    // message has to say which list to move it to.
    expect(violations).toEqual([]);
  });

  test('the bundler plugin is a runtime dependency of the server', () => {
    // The specific regression, pinned by name. `bunfig.toml` is what makes the
    // plugin runtime code, so the two are read together: if the plugin ever
    // stops being a `serve.static` entry, this assertion is what says the
    // dependency placement no longer has to hold.
    const bunfig = Bun.TOML.parse(readFileSync(join(ROOT, 'bunfig.toml'), 'utf8')) as {
      serve?: { static?: { plugins?: string[] } };
    };
    expect(bunfig.serve?.static?.plugins).toContain('./src/server/lib/bundler/css.ts');

    for (const name of ['@tailwindcss/postcss', 'postcss']) {
      expect(RUNTIME.has(name)).toBe(true);
      expect(DEV.has(name)).toBe(false);
    }
  });
});
