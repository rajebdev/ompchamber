/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where the chamber's own packages live, resolved from this module.
 *
 * The chamber needs this to LINK them into a plugin's `node_modules` before a
 * build, and the plugin needs the names to import. Keeping both here means the
 * list is defined once: a package added to `packages/` becomes importable by
 * writing one entry, and a specifier that stops resolving breaks in one place.
 *
 * `import.meta.dir` rather than the cwd: a plugin's build runs with the PLUGIN's
 * directory as its working directory, so a cwd-relative lookup would point into
 * the marketplace.
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Every package a plugin may import by name, mapped to its source entry.
 *
 * The key is the exact specifier a plugin writes, so subpath exports
 * (`@ompchamber/ui/components`) are rows here rather than something a resolver
 * has to infer from a package.json.
 */
export const CHAMBER_PACKAGES: Record<string, string> = {
  '@ompchamber/plugin-sdk': 'packages/plugin-sdk/src/index.ts',
  '@ompchamber/ui': 'packages/ui/src/index.tsx',
  '@ompchamber/ui/components': 'packages/ui/src/components.tsx',
  '@ompchamber/ui/styles.css': 'packages/ui/src/styles.css',
};

/** The chamber's own checkout — the package that contains `packages/`. */
export function chamberRoot(): string {
  // This module lives at `<root>/packages/plugin-build/src/`, so the root is
  // three levels up.
  return resolve(import.meta.dir, '..', '..', '..');
}

/** Absolute path for each specifier that exists on disk, keyed by specifier. */
export function chamberPackagePaths(root = chamberRoot()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [specifier, relative] of Object.entries(CHAMBER_PACKAGES)) {
    const path = join(root, relative);
    if (existsSync(path)) out[specifier] = path;
  }
  return out;
}

/**
 * The package directory each specifier belongs to, keyed by package name.
 *
 * `@ompchamber/ui` and `@ompchamber/ui/components` are two entries of ONE
 * package, and a symlink is per package — linking twice would replace the first
 * with the second.
 */
export function chamberPackageDirs(root = chamberRoot()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const specifier of Object.keys(chamberPackagePaths(root))) {
    const name = specifier.split('/').slice(0, 2).join('/');
    out[name] ??= join(root, 'packages', name.split('/')[1]);
  }
  return out;
}
