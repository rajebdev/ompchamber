/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel-plugin discovery.
 *
 * There is ONE marketplace:
 *
 *   ~/.ompchamber/marketplace/
 *     marketplace.json        the catalog — the plugins registered by default
 *     plugins/
 *       session-info/
 *         ompchamber.json     a plugin manifest
 *         index.html
 *
 * It lives in the DATA directory rather than inside the package because that is
 * the only location both install shapes can write: a globally installed package
 * sits in a read-only `node_modules`, and the update flow replaces it outright,
 * so a plugin installed from a git URL there would vanish on the next upgrade.
 * The bundled copy under `<package>/marketplace/` is the SEED, applied once by
 * `seedDefaultMarketplace()` before the server listens — never re-applied, so a
 * plugin the user removes stays removed.
 *
 * The catalog and the directory are independent, and both directions matter:
 * a plugin present under `plugins/` but absent from the catalog still loads
 * (that is what makes a hand-copied folder work), and a catalog entry naming a
 * directory that holds no plugin is REPORTED (that is what makes a failed
 * install visible instead of silent).
 *
 * Nothing here executes plugin code. The scan reads manifests, validates them,
 * and reports every rejection with its reason; the frame is loaded later, by the
 * browser, through the sandboxed asset route.
 */

import { homedir } from 'os';
import { join, resolve } from 'path';
import type { PanelPluginManifest, PanelPluginStatus, PanelRegistryPayload } from '@/shared/types';
import { pathExists } from '@/server/lib/omp/core/paths';
import { isRecord } from '@/shared/lib/util/guards';
import { slugForPanelKey } from '@/shared/lib/panels/asset-base';
import { pluginPanelKey } from '@/shared/lib/workspace/panel-ids';
import { toManifest, toMarketplaceCatalog } from '@/server/lib/panels/manifest';

/** The marketplace root: `~/.ompchamber/marketplace`, overridable for tests. */
export function getMarketplaceDir(): string {
  const override = Bun.env.OMPCHAMBER_MARKETPLACE_DIR;
  if (override) return resolve(override);
  return join(homedir(), '.ompchamber', 'marketplace');
}

/** Where a plugin's files live inside the marketplace. */
export function getMarketplacePluginsDir(): string {
  return join(getMarketplaceDir(), 'plugins');
}

/** The catalog file, which an install appends its entry to. */
export function getMarketplaceCatalogPath(): string {
  return join(getMarketplaceDir(), 'marketplace.json');
}

/** The marketplace's stable id, used to attribute panels and rejections. */
const MARKETPLACE_ID = 'ompchamber';

const SCAN_CACHE_TTL_MS = 5_000;

/**
 * A scan result: the payload the client renders, plus the panel → directory map
 * the asset route needs.
 *
 * The two are deliberately separate. The directory is an absolute path on the
 * user's machine, and the payload is a browser response — publishing the install
 * layout to every plugin frame buys nothing, since the route resolves the root
 * from this map rather than from the request.
 */
interface PanelScan extends PanelRegistryPayload {
  dirs: Record<string, string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberPanelScan: { at: number; dir: string; scan: PanelScan } | undefined;
}

/** Drop the scan cache — called after an install, a remove, or a Refresh. */
export function invalidatePanelScan(): void {
  globalThis.__ompChamberPanelScan = undefined;
}

/** Sorted directory names directly under `dir`; empty when it does not exist. */
async function subdirectories(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  try {
    return (await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: dir, onlyFiles: false })))
      .map((name) => name.replace(/[/\\]+$/, ''))
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

async function readJsonBody(
  file: string,
): Promise<{ kind: 'none' } | { kind: 'unreadable' } | { kind: 'body'; value: unknown }> {
  if (!(await pathExists(file))) return { kind: 'none' };
  try {
    return { kind: 'body', value: await Bun.file(file).json() };
  } catch {
    return { kind: 'unreadable' };
  }
}

/**
 * Read a plugin's manifest.
 *
 * Two files can carry it, and both must be tried: `ompchamber.json` for a
 * hand-written plugin, and `package.json`'s `ompchamber` key for a Bun package —
 * which is what a plugin IS, so the second is the common case rather than a
 * legacy one. Every caller (the scan, the installer, the builder) goes through
 * this one function; when the installer had its own copy it read only the first
 * file and refused to install any package at all.
 *
 * Three answers, and the difference between the first two is load-bearing: a
 * directory with no manifest at all is not a plugin and is skipped in silence
 * (the root is a directory a user may drop a README into), while a manifest that
 * EXISTS but cannot be parsed is a plugin that was meant to be installed and
 * must be reported. Collapsing them made every stray folder show up as
 * "Rejected".
 */
export async function readPluginManifest(
  dir: string,
): Promise<{ kind: 'none' } | { kind: 'error'; reason: string } | { kind: 'manifest'; value: unknown }> {
  const own = await readJsonBody(join(dir, 'ompchamber.json'));
  if (own.kind === 'unreadable') return { kind: 'error', reason: 'ompchamber.json is not valid JSON' };
  if (own.kind === 'body') return { kind: 'manifest', value: own.value };

  const pkg = await readJsonBody(join(dir, 'package.json'));
  if (pkg.kind === 'unreadable') return { kind: 'error', reason: 'package.json is not valid JSON' };
  if (pkg.kind === 'none') return { kind: 'none' };
  if (!isRecord(pkg.value) || pkg.value.ompchamber === undefined) return { kind: 'none' };
  return { kind: 'manifest', value: pkg.value.ompchamber };
}

async function runPanelScan(): Promise<PanelScan> {
  const root = getMarketplaceDir();
  const pluginsRoot = getMarketplacePluginsDir();
  const scan: PanelScan = { panels: [], marketplaces: [], errors: [], plugins: [], dirs: {} };

  // Rejections are tagged with the marketplace id so the pane groups by a value
  // rather than by matching on a path.
  const fail = (dir: string, reason: string) => scan.errors.push({ dir, reason, marketplace: MARKETPLACE_ID });

  let name = 'OMPChamber';
  let description: string | undefined;

  const catalogRead = await readJsonBody(getMarketplaceCatalogPath());
  if (catalogRead.kind === 'unreadable') {
    fail(getMarketplaceCatalogPath(), 'marketplace.json is not valid JSON');
  } else if (catalogRead.kind === 'body') {
    const catalog = toMarketplaceCatalog(catalogRead.value, root);
    if ('error' in catalog) {
      fail(getMarketplaceCatalogPath(), catalog.error);
    } else {
      name = catalog.name ?? name;
      description = catalog.description;
      // A catalog entry naming a directory that holds no plugin is reported: it
      // is the file saying "this is installed" while the scan found nothing, and
      // silence would make a failed install look like a plugin that refused to
      // load.
      for (const entry of catalog.plugins ?? []) {
        const source = resolve(root, entry.source);
        if (!(await pathExists(source))) {
          fail(source, `listed in marketplace.json but no plugin was found there (${entry.name})`);
        }
      }
    }
  }

  const seenKeys = new Set<string>();
  const pluginStatus: PanelPluginStatus[] = [];
  for (const pluginName of await subdirectories(pluginsRoot)) {
    const pluginDir = join(pluginsRoot, pluginName);
    const read = await readPluginManifest(pluginDir);
    if (read.kind === 'none') continue;
    if (read.kind === 'error') {
      fail(pluginDir, read.reason);
      continue;
    }
    const manifest = toManifest(read.value, pluginDir);
    if ('error' in manifest) {
      fail(pluginDir, manifest.error);
      continue;
    }

    // A Bun package is served from its build output, so the entry it names must
    // already exist. A plugin whose build has not run is reported as UNBUILT
    // rather than as broken — the manifest is fine, and the pane offers to run
    // the build — which is why this is a separate list from `errors`.
    const isPackage = await pathExists(join(pluginDir, 'package.json'));
    const missingEntry = await firstMissingEntry(pluginDir, manifest);
    pluginStatus.push({
      pluginId: manifest.id,
      name: manifest.name,
      isPackage,
      built: !missingEntry,
      ...(missingEntry ? { reason: `the build produced no ${missingEntry}` } : {}),
    });

    for (const panel of manifest.panels) {
      const panelKey = pluginPanelKey(manifest.id, panel.id);
      if (seenKeys.has(panelKey)) {
        fail(pluginDir, `duplicate panel id ${panelKey}`);
        continue;
      }
      seenKeys.add(panelKey);
      scan.panels.push({
        ...panel,
        panelKey,
        pluginId: manifest.id,
        pluginName: manifest.name,
        pluginVersion: manifest.version,
        marketplace: MARKETPLACE_ID,
      });
      scan.dirs[panelKey] = pluginDir;
    }
  }

  scan.marketplaces.push({ id: MARKETPLACE_ID, name, description, panelCount: scan.panels.length, errors: [] });
  scan.plugins = pluginStatus;

  return scan;
}

async function cachedScan(): Promise<PanelScan> {
  const dir = getMarketplaceDir();
  const cached = globalThis.__ompChamberPanelScan;
  if (cached && cached.dir === dir && Date.now() - cached.at < SCAN_CACHE_TTL_MS) return cached.scan;
  const scan = await runPanelScan();
  globalThis.__ompChamberPanelScan = { at: Date.now(), dir, scan };
  return scan;
}

/** The client payload: the marketplace, its panels, and its rejections. */
export async function discoverPanelPlugins(): Promise<PanelRegistryPayload> {
  const { panels, marketplaces, errors, plugins } = await cachedScan();
  return { panels, marketplaces, errors, plugins };
}

/**
 * The first entry a plugin's manifest names that is not on disk, or undefined
 * when every one of them is.
 *
 * The check is per panel, not per plugin: a package whose build emitted one
 * document and failed on the second would otherwise report as fully built, and
 * only the broken panel's frame would 404.
 */
async function firstMissingEntry(pluginDir: string, manifest: PanelPluginManifest): Promise<string | undefined> {
  for (const panel of manifest.panels) {
    if (!(await pathExists(join(pluginDir, panel.entry)))) return panel.entry;
  }
  return undefined;
}

/**
 * The absolute directory one panel's assets are served from, addressed by the
 * slug the asset URL carries.
 *
 * The asset route resolves its root from here rather than from the request, so
 * a caller can only ever name a file inside an installed plugin. Both halves of
 * the lookup are here for the same reason: the slug→key mapping and the
 * key→directory map are one fact, and splitting them across modules is how the
 * two spellings drift.
 */
export async function findPanelDirBySlug(slug: string): Promise<string | undefined> {
  const scan = await cachedScan();
  const panel = scan.panels.find((entry) => slugForPanelKey(entry.panelKey) === slug);
  return panel ? scan.dirs[panel.panelKey] : undefined;
}
