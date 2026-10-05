/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A panel plugin is a Bun package, and this is its build.
 *
 * The plugin directory is a normal Bun project — `package.json`, a TSX entry and
 * whatever dependencies it declares — and the chamber bundles it with the SAME
 * tool the app bundles itself with. That is the point of the shape: a plugin
 * author writes TypeScript, imports from `node_modules`, and gets one
 * self-contained output, exactly as this repo does for its own client.
 *
 * Four properties are load-bearing:
 *
 * - **The build runs in the plugin's own directory.** Bun resolves `node_modules`
 *   and `package.json` from the cwd of the build, so building elsewhere would
 *   silently fail to resolve the plugin's own dependencies.
 * - **`@ompchamber/*` is linked into the plugin's `node_modules` before the
 *   build.** The SDK and the UI kit are workspace packages inside this checkout,
 *   so a plugin cloned into the marketplace cannot resolve them from its own
 *   install — `bun install` would have to fetch them from a registry that does
 *   not carry them. Linking them is the boring answer that works for every
 *   bundler a plugin might use, rather than only for `bun build`: a `--preload`
 *   resolver was measured NOT to reach the CLI's build at all (Bun 1.4.2), and
 *   `BUN_OPTIONS` breaks `bun run` itself.
 * - **Output goes to `dist/`, which the asset route serves as the document root
 *   for a built plugin.** The manifest's `entry` therefore names a BUILT file
 *   (`dist/index.html`), and every asset the bundle emits sits beside it with a
 *   relative URL — which is what the sandboxed frame needs, since its opaque
 *   origin cannot resolve anything absolute.
 * - **`bun install` runs first, with lifecycle scripts disabled.** A plugin's
 *   dependencies are its own; without the install a fresh clone has no
 *   `node_modules` and every import fails. `--ignore-scripts` because a
 *   postinstall would execute arbitrary code on the SERVER, outside the sandbox
 *   that the panel itself runs in.
 * - **A plugin declares `@ompchamber/*` as OPTIONAL PEER dependencies.** They are
 *   provided by the host and linked in below, never fetched. The `optional` flag
 *   is the load-bearing half: measured on Bun 1.4.2 with the package absent from
 *   the registry, `dependencies` exits 1, a plain `peerDependencies` entry exits
 *   1 with the same 404, and only `peerDependenciesMeta.optional` exits 0. A
 *   plugin cloned into the marketplace is built before npm is guaranteed to
 *   carry these, so without the flag the install would fail outright.
 *
 * A plugin that ships no `package.json`, or one with no `build` script and no
 * entry Bun can infer, is NOT built: its files are served as-is. That keeps a
 * hand-written HTML plugin working, which is what the scan's "directory is what
 * makes a plugin exist" rule has always promised.
 */

import { mkdir, rm, stat, symlink } from 'fs/promises';
import { join, relative, resolve } from 'path';
import type { PanelPluginManifest } from '@/shared/types';
import { pathExists } from '@/server/lib/omp/core/paths';
import { resolveBunBin } from '@/server/lib/lifecycle/bun';
import { runShell } from '@/server/lib/fs/shell';
import { chamberPackageDirs } from '@ompchamber/plugin-build';

/** Where a built plugin's output lands, relative to the plugin root. */
export const PLUGIN_BUILD_DIR = 'dist';

/**
 * The outcome of a build attempt.
 *
 * Three states, not two, and the difference is load-bearing at the call site: a
 * plugin that is NOT a package (a hand-written HTML plugin) is perfectly
 * servable as-is and must install normally, while a build that FAILED means
 * there is nothing to serve. Collapsing them into one `built: false` made every
 * non-package plugin refuse to register.
 */
export type PluginBuildStatus =
  /** The output exists and the manifest's entries resolve inside it. */
  | 'built'
  /** No package.json build script or source entry — the files are served as they are. */
  | 'not-a-package'
  /** A build ran and did not produce what the manifest names. */
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
 * Symlink the chamber's own packages into a plugin's `node_modules`.
 *
 * Symlinks rather than copies: the packages are developed in place, and a copy
 * taken at install time would pin a plugin to whatever the sources said that
 * day. A pre-existing entry is replaced, because a plugin that shipped its own
 * (stale) copy of the SDK would otherwise shadow the chamber's.
 *
 * Best-effort: a plugin that imports none of them builds fine without this, so a
 * failure here is not a build failure.
 */
export async function linkChamberPackages(root: string): Promise<void> {
  const dirs = chamberPackageDirs();
  if (Object.keys(dirs).length === 0) return;

  const scope = join(root, 'node_modules', '@ompchamber');
  try {
    await mkdir(scope, { recursive: true });
  } catch {
    return;
  }

  for (const [name, packageRoot] of Object.entries(dirs)) {
    const target = join(scope, name.split('/')[1]);
    try {
      await rm(target, { recursive: true, force: true });
      await symlink(packageRoot, target, 'junction');
    } catch {
      // A filesystem without symlink support: the plugin's own build may still
      // work, so this is not fatal.
    }
  }

  await linkPeerRuntime(root);
}

/**
 * Make the plugin's `preact` the one the LINKED packages resolve.
 *
 * A panel bundle must contain exactly ONE Preact. The linked UI kit lives at its
 * own path, so its `import 'preact'` resolves up from `packages/ui/` — which in
 * this checkout finds the chamber's copy, while the plugin's own `import 'preact'`
 * finds the plugin's. Two copies means two module-level option objects, and
 * Preact's hooks read the current component from a shared one: the panel died at
 * render with `Cannot read properties of undefined (reading '__H')`.
 *
 * Pointing the package's own `node_modules/preact` at the plugin's copy makes
 * both sides resolve the same files. A plugin that declares no `preact` is left
 * alone — it does not render, so it has no second copy to reconcile.
 */
async function linkPeerRuntime(root: string): Promise<void> {
  const pluginPreact = join(root, 'node_modules', 'preact');
  if (!(await pathExists(join(pluginPreact, 'package.json')))) return;

  for (const packageRoot of Object.values(chamberPackageDirs())) {
    const scope = join(packageRoot, 'node_modules');
    try {
      await mkdir(scope, { recursive: true });
      const target = join(scope, 'preact');
      await rm(target, { recursive: true, force: true });
      await symlink(resolve(pluginPreact), target, 'junction');
    } catch {
      // Best effort: a checkout whose packages already resolve one preact needs
      // nothing here.
    }
  }
}

/** A plugin is buildable when it declares a package.json with a build script or a source entry. */
async function buildCommand(root: string): Promise<string[] | null> {
  const pkgPath = join(root, 'package.json');
  if (!(await pathExists(pkgPath))) return null;

  let scripts: Record<string, unknown> = {};
  try {
    const parsed: unknown = await Bun.file(pkgPath).json();
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (record.scripts && typeof record.scripts === 'object') scripts = record.scripts as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  // An explicit `build` script wins: a plugin may need a bundler pass this
  // module knows nothing about (a framework, a template compiler), and second-
  // guessing it would break the plugins that need it most.
  if (typeof scripts.build === 'string' && scripts.build.trim()) {
    return [resolveBunBin(), 'run', 'build'];
  }
  // No build script: the conventional entry is bundled directly, which covers
  // the common case (a TSX entry plus a stylesheet import) without asking the
  // author to write a build script at all.
  for (const candidate of ['src/index.html', 'src/index.tsx', 'src/index.ts', 'src/index.js', 'index.html']) {
    if (await pathExists(join(root, candidate))) {
      return [resolveBunBin(), 'build', candidate, '--outdir', PLUGIN_BUILD_DIR, '--target', 'browser', '--minify'];
    }
  }
  return null;
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
 */
export async function buildPanelPlugin(root: string, manifest: PanelPluginManifest): Promise<PluginBuildResult> {
  const command = await buildCommand(root);
  if (!command) return { status: 'not-a-package', reason: 'no package.json build script or source entry' };

  // A stale output is worse than no output: the asset route would serve chunks
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

  const build = await runShell(command.map(shellQuote).join(' '), { cwd: root, timeout: BUILD_TIMEOUT_MS });
  if (build.exitCode !== 0) {
    return { status: 'failed', reason: firstLine(build.stderr) || firstLine(build.stdout) || 'build failed' };
  }

  // EVERY entry the manifest names must exist after the build, not just the
  // first: a package whose build emitted one document and failed on the second
  // would otherwise report as built, and only the missing panel's frame would
  // 404 — the failure surfacing at the one place it cannot be explained.
  for (const panel of manifest.panels) {
    const entryPath = join(root, panel.entry);
    if (!(await pathExists(entryPath))) {
      return { status: 'failed', reason: `the build produced no ${relative(root, entryPath)}` };
    }
  }
  return { status: 'built', outDir: PLUGIN_BUILD_DIR };
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
