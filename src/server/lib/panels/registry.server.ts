/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel-plugin discovery.
 *
 * There is ONE store and ONE working marketplace:
 *
 *   <package>/marketplace/            the STORE — what the app ships
 *     plugins/session-info/           an offer, not an install
 *
 *   ~/.ompchamber/marketplace/        the WORKING copy — what is installed
 *     marketplace.json                the catalog
 *     plugins/session-info/           an installed plugin
 *       package.json                  manifest under its `ompchamber` key
 *       dist/app.js                   the built ESM bundle the host imports
 *
 * The working copy lives in the DATA directory rather than inside the package
 * because that is the only location both install shapes can write: a globally
 * installed package sits in a read-only `node_modules`, and the update flow
 * replaces it outright, so a plugin installed there would vanish on the next
 * upgrade. The bundled copy is the seed for the STORE list, never copied
 * automatically.
 *
 * The catalog and the directory are independent, and both directions matter:
 * a plugin present under `plugins/` but absent from the catalog still loads
 * (that is what makes a hand-copied folder work), and a catalog entry naming a
 * directory that holds no plugin is REPORTED (that is what makes a failed
 * install visible instead of silent).
 *
 * Nothing here executes plugin code. The scan reads manifests, validates them,
 * and reports every rejection with its reason; the bundle is imported later, by
 * the browser, from the bundle route.
 */

import { homedir } from 'os';
import { join, resolve } from 'path';
import type {
  PanelCatalogEntry,
  PanelPluginStatus,
  PanelRegistryPayload,
} from '@/shared/types';
import { pathExists } from '@/server/lib/omp/core/paths';
import { packageDir } from '@/server/lib/assets/fonts.server';
import { readDisabledPlugins } from '@/server/lib/panels/state.server';
import { findReadme, readJsonBody, readPluginManifest, subdirectories } from '@/server/lib/panels/files.server';
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

/**
 * The STORE: the marketplace bundled with the package.
 *
 * Read-only and never copied. The bundled plugins are what the Panel Plugins
 * pane offers to install — an offer, not an install — so nothing here is
 * scanned as a contribution and nothing here is built. Installing one copies
 * its directory into the working marketplace and builds it there, exactly as a
 * git install does, which is what keeps the two install paths one code path.
 *
 * Overridable so the seed and install tests can point at a fixture tree.
 */
export function getBundledMarketplaceDir(): string {
  const override = Bun.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
  if (override) return resolve(override);
  return join(packageDir(), 'marketplace');
}

/** The marketplace's stable id, used to attribute panels and rejections. */
const MARKETPLACE_ID = 'ompchamber';

const SCAN_CACHE_TTL_MS = 5_000;

/**
 * A scan result: the payload the client renders, plus the plugin → directory
 * map the bundle route needs.
 *
 * The two are deliberately separate. The directory is an absolute path on the
 * user's machine, and the payload is a browser response — publishing the install
 * layout to every plugin buys nothing, since the route resolves the root from
 * this map rather than from the request.
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

async function runPanelScan(): Promise<PanelScan> {
  const root = getMarketplaceDir();
  const pluginsRoot = getMarketplacePluginsDir();
  const scan: PanelScan = { panels: [], marketplaces: [], errors: [], plugins: [], catalog: [], dirs: {} };

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

  // Read once, before the loop: whether a plugin is ON decides whether its
  // bundle is published, and the flag is stored rather than derived.
  const disabled = new Set(await readDisabledPlugins());

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

    // A plugin is served from its build output, so the bundle its manifest
    // names must already exist. A plugin whose build has not run is reported as
    // UNBUILT rather than as broken — the manifest is fine, and the pane offers
    // to run the build — which is why this is a separate list from `errors`.
    const isPackage = await pathExists(join(pluginDir, 'package.json'));
    const enabled = !disabled.has(manifest.id);
    const built = await pathExists(join(pluginDir, manifest.app));
    pluginStatus.push({
      pluginId: manifest.id,
      name: manifest.name,
      isPackage,
      built,
      enabled,
      bundled: false,
      ...(built ? {} : { reason: `the build produced no ${manifest.app}` }),
    });

    // A switched-off plugin contributes NOTHING: no button, no tab, and no
    // bundle for the route to serve. Its files stay on disk, which is the whole
    // difference between disabling and removing.
    if (!enabled || !built) continue;

    scan.panels.push({
      pluginId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      appUrl: await bundleUrl(pluginDir, manifest.app),
      ...(manifest.icon ? { iconUrl: await iconUrl(pluginDir, manifest.icon) } : {}),
      ...(await readmeUrlFor(pluginDir, manifest)),
    });
    scan.dirs[manifest.id] = pluginDir;
  }

  // The bundled marketplace is a STORE, so its plugins are listed whether or
  // not they are installed — that is what gives the pane something to install
  // FROM. They are never scanned as contributions and never built: installing
  // copies one into the working marketplace, where the loop above picks it up.
  const installed = new Set(pluginStatus.map((plugin) => plugin.pluginId));
  scan.catalog = await readBundledCatalog(installed);
  // `bundled` is a property of the SOURCE, not of the install: it is what makes
  // the pane offer "Remove" for a bundled plugin rather than "Uninstall", and
  // it is read off the store's own list so a plugin id that exists in both
  // places cannot report the wrong one.
  const bundledIds = new Set(scan.catalog.map((entry) => entry.pluginId));
  for (const plugin of pluginStatus) plugin.bundled = bundledIds.has(plugin.pluginId);

  scan.marketplaces.push({ id: MARKETPLACE_ID, name, description, panelCount: scan.panels.length, errors: [] });
  scan.plugins = pluginStatus;

  return scan;
}

/**
 * A plugin's bundle URL, carrying the file's content hash.
 *
 * The hash is not decoration: the browser caches an ES module by URL, so a
 * REBUILT plugin imported from the same URL would return the first evaluation
 * and never re-run its `setup`. A changed hash is a changed URL, which is what
 * makes "Rebuild" actually reload the plugin.
 */
async function bundleUrl(pluginDir: string, app: string): Promise<string> {
  const file = Bun.file(join(pluginDir, app));
  const digest = Bun.hash(await file.arrayBuffer()).toString(36);
  return `/api/panels/bundle/${encodeURIComponent(basenameOf(pluginDir))}.js?v=${digest}`;
}

/**
 * A plugin's README URL, when it ships one — either the file its manifest names
 * or the `README.md` at its root.
 */
async function readmeUrlFor(
  pluginDir: string,
  manifest: { readme?: string },
): Promise<{ readmeUrl?: string }> {
  const readme = await findReadme(pluginDir, manifest.readme);
  if (!readme) return {};
  const file = Bun.file(join(pluginDir, readme));
  const digest = Bun.hash(await file.arrayBuffer()).toString(36);
  return {
    readmeUrl: `/api/panels/readme/${encodeURIComponent(basenameOf(pluginDir))}/${readme
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?v=${digest}`,
  };
}

/** A plugin's icon URL, likewise content-addressed. */
async function iconUrl(pluginDir: string, icon: string): Promise<string> {
  const file = Bun.file(join(pluginDir, icon));
  const digest = Bun.hash(await file.arrayBuffer()).toString(36);
  return `/api/panels/icon/${encodeURIComponent(basenameOf(pluginDir))}/${icon.split('/').map(encodeURIComponent).join('/')}?v=${digest}`;
}

function basenameOf(dir: string): string {
  return dir.split(/[/\\]/).filter(Boolean).pop() ?? '';
}

/**
 * The bundled marketplace's offers, in directory order.
 *
 * A store entry is a plugin DIRECTORY with a valid manifest — the same rule the
 * working scan follows, so the two agree about what a plugin is. An entry whose
 * manifest is broken is skipped here rather than reported: the store is the
 * app's own shipping list, so a broken entry is a packaging fault, and the pane
 * has no install action that could repair it.
 */
async function readBundledCatalog(installed: ReadonlySet<string>): Promise<PanelCatalogEntry[]> {
  const bundledRoot = join(getBundledMarketplaceDir(), 'plugins');
  const entries: PanelCatalogEntry[] = [];
  for (const pluginName of await subdirectories(bundledRoot)) {
    const pluginDir = join(bundledRoot, pluginName);
    const read = await readPluginManifest(pluginDir);
    if (read.kind !== 'manifest') continue;
    const manifest = toManifest(read.value, pluginDir);
    if ('error' in manifest) continue;
    entries.push({
      pluginId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      ...(manifest.description ? { description: manifest.description } : {}),
      // The store's OWN icon and README, so a card can show the mark and the
      // details before the plugin is installed. Both come from the bundled
      // directory, which the routes resolve through the same registry.
      ...(manifest.icon ? { iconUrl: await iconUrl(pluginDir, manifest.icon) } : {}),
      ...(await readmeUrlFor(pluginDir, manifest)),
      installed: installed.has(manifest.id),
    });
  }
  return entries;
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
  const { panels, marketplaces, errors, plugins, catalog } = await cachedScan();
  return { panels, marketplaces, errors, plugins, catalog };
}

/**
 * The absolute file one plugin's bundle or icon is served from, addressed by the
 * directory name the URL carries.
 *
 * The URL names a plugin DIRECTORY rather than an arbitrary path, so a caller
 * can only ever reach a file inside a plugin the registry knows: the route
 * resolves the root from this map and appends a relative path the manifest
 * already had validated.
 *
 * TWO roots are searched, in this order, and the order is the whole point:
 * the WORKING marketplace first, then the bundled STORE. A store card has to
 * draw an icon for a plugin that is not installed yet, so the bundled directory
 * must be reachable — while an installed plugin must win, or a card would keep
 * showing the shipped icon after the user replaced it. A directory that is
 * neither installed-and-enabled nor a bundled offer is not reachable at all,
 * which is what makes disabling a plugin stop its code from loading rather than
 * merely hiding its button.
 */
export async function findPluginDir(pluginName: string): Promise<string | undefined> {
  const scan = await cachedScan();
  for (const dir of Object.values(scan.dirs)) {
    if (basenameOf(dir) === pluginName) return dir;
  }
  const bundledRoot = join(getBundledMarketplaceDir(), 'plugins');
  for (const dir of await subdirectories(bundledRoot)) {
    if (dir === pluginName) return join(bundledRoot, dir);
  }
  return undefined;
}
