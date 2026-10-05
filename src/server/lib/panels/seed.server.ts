/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seeding the marketplace from the copy bundled with the package.
 *
 * The bundled marketplace (`<package>/marketplace/`) ships the default plugins
 * and is the source of truth for what "by default" means. The working copy lives
 * in the data directory because that is the only location both install shapes
 * can write: a globally installed package sits in a read-only `node_modules`, and
 * the update flow replaces it outright, so a plugin installed from a git URL
 * there would vanish on the next upgrade.
 *
 * The seed runs ONCE, guarded by a marker rather than by "the directory is
 * empty". An empty-directory test cannot tell a fresh install from a user who
 * deleted the defaults on purpose, so it would resurrect them on every boot —
 * the same reasoning `workspace_sync_ran` follows for the sidebar.
 *
 * It runs before the server listens, not from a route: a first request must
 * already see the defaults, or the panel flashes an empty marketplace.
 */

import { cp, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { pathExists } from '@/server/lib/omp/core/paths';
import { packageDir } from '@/server/lib/assets/fonts.server';
import {
  discoverPanelPlugins,
  getMarketplaceDir,
  getMarketplacePluginsDir,
  invalidatePanelScan,
  readPluginManifest,
} from '@/server/lib/panels/registry.server';
import { buildPanelPlugin } from '@/server/lib/panels/build.server';
import { toManifest } from '@/server/lib/panels/manifest';
import type { PanelPluginManifest } from '@/shared/types';

/** The marketplace bundled with the package. Overridable so the seed is testable. */
export function getBundledMarketplaceDir(): string {
  const override = Bun.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
  if (override) return resolve(override);
  return join(packageDir(), 'marketplace');
}

/** Marker proving the seed already ran, so a deletion is not undone. */
const SEED_MARKER = '.seeded';

export interface SeedResult {
  seeded: boolean;
  /** Why the seed did not run, or why a seeded plugin failed to build. */
  reason?: string;
}

/**
 * Seed the marketplace, then build every plugin that needs it.
 *
 * The seed copies SOURCES only: a plugin's `dist/` is gitignored, so the bundled
 * copy in a checkout (and in a published package) has no build output at all.
 * Building here is what makes the defaults work on a fresh install without the
 * user running anything — and it is the same builder an install uses, so a
 * bundled plugin and an installed one are produced identically.
 *
 * A build failure is reported, not thrown: the plugin keeps its manifest and the
 * pane offers a Rebuild, which is a far better outcome than refusing to start.
 */
export async function seedDefaultMarketplace(): Promise<SeedResult> {
  const target = getMarketplaceDir();
  if (await pathExists(join(target, SEED_MARKER))) return { seeded: false, reason: 'already seeded' };

  const source = getBundledMarketplaceDir();
  if (!(await pathExists(source))) return { seeded: false, reason: 'no bundled marketplace in this package' };

  try {
    // `cp` with recursive copies the tree; `force: false` would refuse to
    // overwrite, but a markerless target that already holds files is exactly
    // the upgrade case (a user who had plugins before the marker existed), so
    // the copy is allowed to fill in what is missing without clobbering edits.
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    await Bun.write(join(target, SEED_MARKER), new Date().toISOString() + '\n');
    invalidatePanelScan();
  } catch (error) {
    return { seeded: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const build = await buildSeededPlugins();
  return { seeded: true, ...(build.reason ? { reason: build.reason } : {}) };
}

/** Build every seeded plugin whose manifest names an entry that is not on disk. */
async function buildSeededPlugins(): Promise<{ built: number; reason?: string }> {
  const { plugins } = await discoverPanelPlugins();
  const unbuilt = plugins.filter((plugin) => plugin.isPackage && !plugin.built);
  if (unbuilt.length === 0) return { built: 0 };

  let built = 0;
  const failures: string[] = [];
  for (const plugin of unbuilt) {
    const root = join(getMarketplacePluginsDir(), plugin.pluginId);
    const manifest = await readPluginManifestForBuild(root);
    if (!manifest) continue;
    const result = await buildPanelPlugin(root, manifest);
    if (result.status === 'built') built += 1;
    else if (result.status === 'failed') failures.push(`${plugin.pluginId}: ${result.reason ?? 'build failed'}`);
  }
  invalidatePanelScan();
  return { built, ...(failures.length > 0 ? { reason: failures.join('; ') } : {}) };
}

/**
 * The manifest to build with, read straight off disk through the shared reader.
 *
 * The scan's own entries are the client payload, which deliberately carries no
 * filesystem paths — so the build re-reads the manifest rather than reverse-
 * engineering a directory from a panel key.
 */
async function readPluginManifestForBuild(root: string): Promise<PanelPluginManifest | undefined> {
  const read = await readPluginManifest(root);
  if (read.kind !== 'manifest') return undefined;
  const manifest = toManifest(read.value, root);
  return 'error' in manifest ? undefined : manifest;
}
