/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A panel plugin is a Bun package, and this is its build.
 *
 * The plugin directory is a normal Bun project — `package.json`, a TSX entry and
 * whatever dependencies it declares — and the chamber bundles it into ONE ESM
 * file that the host `import()`s into its own page. That is the point of the
 * shape: a plugin author writes TypeScript, imports from `node_modules`, and
 * gets one self-contained module, exactly as this repo does for its own client.
 *
 * Four properties are load-bearing:
 *
 * - **The build runs in the plugin's own directory.** Bun resolves `node_modules`
 *   and `package.json` from the cwd of the build, so building elsewhere would
 *   silently fail to resolve the plugin's own dependencies.
 * - **`@ompchamber/*` is linked into the plugin's `node_modules` before the
 *   build.** The SDK and the UI kit are installed packages, so a plugin cloned
 *   into the marketplace cannot resolve them from its own install — `bun install`
 *   would have to fetch them from a registry, and the chamber must link the
 *   copies IT runs with. Linking is the boring answer that works for every
 *   bundler a plugin might use, rather than only for `bun build`: a `--preload`
 *   resolver was measured NOT to reach the CLI's build at all (Bun 1.4.2), and
 *   `BUN_OPTIONS` breaks `bun run` itself.
 * - **The shared runtime is EXTERNAL.** `preact`, its hooks and JSX runtimes,
 *   `@ompchamber/plugin-sdk/app` and `@ompchamber/ui` are rewritten to read the
 *   host's `globalThis.__ompchamberPluginRuntime` (see `shim.ts`). A plugin that
 *   bundled its own Preact would create components the host's tree cannot
 *   render, which is why this is a correctness rule and not a size optimisation.
 * - **`bun install` runs first, with lifecycle scripts disabled.** A plugin's
 *   dependencies are its own; without the install a fresh clone has no
 *   `node_modules` and every import fails. `--ignore-scripts` because a
 *   postinstall would execute arbitrary code on the SERVER.
 *
 * A plugin may instead declare its own `build` script. That script WINS: it may
 * need a bundler pass this module knows nothing about, and second-guessing it
 * would break the plugins that need it most. Such a plugin owns its output and
 * must produce the file its manifest names; it also carries its own runtime
 * unless it marks the shared specifiers external itself.
 */

import { mkdir, rm, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { PanelPluginManifest } from '@/shared/types';
import { pathExists } from '@/server/lib/omp/core/paths';
import { resolveBunBin } from '@/server/lib/lifecycle/bun';
import { runShell } from '@/server/lib/fs/shell';
import { runtimeShimPlugin } from '@/server/lib/panels/shim';
import { linkChamberPackages } from '@/server/lib/panels/link.server';

/** Where a built plugin's output lands, relative to the plugin root. */
export const PLUGIN_BUILD_DIR = 'dist';

/**
 * The outcome of a build attempt.
 *
 * Three states, not two, and the difference is load-bearing at the call site: a
 * plugin whose files are already a servable bundle (a hand-written one with no
 * source to compile) is not a FAILURE, while a build that ran and produced
 * nothing means there is no bundle at all. Collapsing them into one
 * `built: false` made every non-package plugin refuse to register.
 */
export type PluginBuildStatus =
  /** The bundle the manifest names exists. */
  | 'built'
  /** Nothing to build: no build script, and no app source to bundle. */
  | 'not-a-package'
  /** A build ran and did not produce the bundle. */
  | 'failed';

export interface PluginBuildResult {
  status: PluginBuildStatus;
  /** Why the build failed, or what it could not produce. */
  reason?: string;
  /** Output directory relative to the plugin root, when built. */
  outDir?: string;
}

const INSTALL_TIMEOUT_MS = 300_000;
const BUILD_TIMEOUT_MS = 180_000;

/**
 * The source file the shimmed bundle is built from.
 *
 * The manifest names the OUTPUT (`dist/app.js`), so the source has to come from
 * a convention. `src/app.tsx` is the documented one; the root-level fallbacks
 * cover a hand-written plugin that has no `src/`.
 */
const APP_SOURCE_CANDIDATES = ['src/app.tsx', 'src/app.ts', 'app.tsx', 'app.ts'];

async function findAppSource(root: string): Promise<string | null> {
  for (const candidate of APP_SOURCE_CANDIDATES) {
    if (await pathExists(join(root, candidate))) return candidate;
  }
  return null;
}

/**
 * Whether the plugin's package.json declares a `build` script.
 *
 * A script WINS over the chamber's own bundler: a plugin may need a pass this
 * module knows nothing about (a framework, a template compiler, a CSS pipeline),
 * and second-guessing it would break the plugins that need it most. Such a
 * plugin is responsible for producing the manifest's `app` file itself, and the
 * runtime shim does not apply to it — it must mark the shared specifiers
 * external on its own if it wants them, or accept its own Preact copy.
 */
async function hasBuildScript(root: string): Promise<boolean> {
  const pkgPath = join(root, 'package.json');
  if (!(await pathExists(pkgPath))) return false;
  try {
    const parsed: unknown = await Bun.file(pkgPath).json();
    if (!parsed || typeof parsed !== 'object') return false;
    const scripts = (parsed as Record<string, unknown>).scripts;
    if (!scripts || typeof scripts !== 'object') return false;
    const build = (scripts as Record<string, unknown>).build;
    return typeof build === 'string' && build.trim().length > 0;
  } catch {
    return false;
  }
}

/** Whether a plugin's package.json declares anything to install. */
async function declaresDependencies(root: string): Promise<boolean> {
  try {
    const parsed: unknown = await Bun.file(join(root, 'package.json')).json();
    if (!parsed || typeof parsed !== 'object') return false;
    const record = parsed as Record<string, unknown>;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const value = record[field];
      if (value && typeof value === 'object' && Object.keys(value).length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Install and build one plugin. Never throws: a failure is a value, because the
 * caller reports it in the pane rather than failing a request.
 *
 * Two paths, and which one runs is decided by the plugin:
 *
 * - **Its own `build` script.** Run as-is; the plugin owns its output and must
 *   produce the file the manifest names. The chamber's shim does not apply, so
 *   such a plugin carries its own runtime unless it marks the shared specifiers
 *   external itself.
 * - **The chamber's bundler.** A shimmed `Bun.build` over the conventional app
 *   source, emitting ONE ESM file at the manifest's `app` path. Every shared
 *   specifier is rewritten to read the host runtime, so the bundle carries no
 *   Preact, no UI kit and no SDK.
 */
export async function buildPanelPlugin(root: string, manifest: PanelPluginManifest): Promise<PluginBuildResult> {
  const outPath = join(root, manifest.app);
  const usesOwnScript = await hasBuildScript(root);
  const source = usesOwnScript ? null : await findAppSource(root);
  if (!usesOwnScript && !source) {
    return {
      status: 'not-a-package',
      reason: `no build script, and none of ${APP_SOURCE_CANDIDATES.join(', ')} exists`,
    };
  }

  // A stale output is worse than no output: the bundle route would serve code
  // the current source no longer produces.
  await rm(join(root, PLUGIN_BUILD_DIR), { recursive: true, force: true });
  await mkdir(join(root, PLUGIN_BUILD_DIR), { recursive: true });

  // Install first (which may replace `node_modules` wholesale), THEN link: a
  // link written before the install would be deleted by it.
  if (await declaresDependencies(root)) {
    const install = await runShell(`${shellQuote(resolveBunBin())} install --ignore-scripts`, {
      cwd: root,
      timeout: INSTALL_TIMEOUT_MS,
    });
    if (install.exitCode !== 0) {
      return { status: 'failed', reason: describeInstallFailure(install.stderr, install.stdout) };
    }
  }
  await linkChamberPackages(root);

  if (usesOwnScript) {
    const build = await runShell(
      [resolveBunBin(), 'run', 'build'].map(shellQuote).join(' '),
      { cwd: root, timeout: BUILD_TIMEOUT_MS },
    );
    if (build.exitCode !== 0) {
      return { status: 'failed', reason: firstLine(build.stderr) || firstLine(build.stdout) || 'build failed' };
    }
  } else {
    try {
      const result = await Bun.build({
        entrypoints: [join(root, source as string)],
        target: 'browser',
        format: 'esm',
        minify: true,
        // Naming is fixed rather than hashed: the manifest names the output, and
        // the bundle route adds a content hash to the URL so a rebuilt plugin is
        // re-imported instead of being served from the browser's module cache.
        naming: '[dir]/[name].[ext]',
        outdir: join(root, PLUGIN_BUILD_DIR),
        plugins: [runtimeShimPlugin()],
      });
      if (!result.success) {
        return { status: 'failed', reason: describeBuildFailure(result.logs) };
      }
    } catch (error) {
      // An UNRESOLVABLE import throws rather than answering `success: false`
      // (measured on Bun 1.4.2), and the thrown error is the only place the
      // specifier that could not be found appears.
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  if (!(await pathExists(outPath))) {
    return { status: 'failed', reason: `the build produced no ${relative(root, outPath)}` };
  }
  return { status: 'built', outDir: PLUGIN_BUILD_DIR };
}

/**
 * The first line that explains a bundler failure.
 *
 * `Bun.build` reports through `logs`, and the useful entry is a message with a
 * file position — a bare "Bundle failed" would name neither the file nor the
 * reason, which is the one thing the pane has to show.
 *
 * One failure gets a rewritten message: a TSX plugin whose tsconfig does not set
 * `jsxImportSource: "preact"` compiles to `react/jsx-dev-runtime`, which is not
 * installed and never should be. The raw error names a package the author never
 * wrote and cannot find, so the fix is spelled out instead.
 */
function describeBuildFailure(logs: readonly { message?: string; position?: unknown }[]): string {
  for (const log of logs) {
    const message = log.message ?? '';
    if (/react\/jsx(-dev)?-runtime/.test(message)) {
      return 'the plugin compiles JSX for React — set "jsxImportSource": "preact" in its tsconfig.json';
    }
  }
  for (const log of logs) {
    const position = log.position as { file?: string; line?: number } | null | undefined;
    if (log.message && position?.file) {
      return `${relative(process.cwd(), position.file)}:${position.line ?? 0}  ${log.message}`;
    }
  }
  const first = logs.find((log) => log.message);
  return first?.message ?? 'the bundle failed';
}

/**
 * The line that explains an install failure, preferring bun's own message.
 *
 * `bun install` prints its error, then a usage banner, then the `package.json`
 * script list — and the banner lines come LAST, so taking the last line (which
 * is what `pluginCliError` does for `omp plugin`, and what this did) reports
 * `$ bun run build` as the reason a plugin could not install. Measured on a
 * plugin declaring a package that is not on npm: the real message is
 * `error: GET https://registry.npmjs.org/@ompchamber%2Fui - 404`.
 *
 * So: the first `error:` line if there is one, else the first line that is not
 * part of the banner.
 */
export function describeInstallFailure(stderr: string | undefined, stdout: string | undefined): string {
  const text = [stderr, stdout].filter(Boolean).join('\n');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const error = lines.find((line) => /^error:/i.test(line));
  if (error) return error;
  const substantive = lines.find(
    (line) => !/^(bun install v|Resolving dependencies|Resolved,|Saved lockfile|Checked \d)/.test(line),
  );
  return substantive ?? 'bun install failed';
}

/** Single-quote a shell argument. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function firstLine(value: string | undefined): string {
  return (value ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

/** Whether a plugin directory already holds a build output. */
export async function hasBuildOutput(root: string): Promise<boolean> {
  try {
    return (await stat(join(root, PLUGIN_BUILD_DIR))).isDirectory();
  } catch {
    return false;
  }
}
