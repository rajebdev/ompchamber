/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel-plugin discovery for the single bundled marketplace.
 *
 * The rules pinned here are the ones a wrong answer makes invisible rather than
 * loud:
 *
 * - a manifest naming a path that escapes its own root must be REJECTED, not
 *   served — the asset route would otherwise read any file the server can open;
 * - a directory with no manifest is not a plugin, so the root may hold a README;
 * - a directory that IS a plugin but is broken must be REPORTED with its reason;
 * - a plugin present under `plugins/` but absent from the catalog still loads —
 *   that is what makes a hand-copied folder work;
 * - a catalog entry naming a missing directory is reported, because the file
 *   says "installed" while nothing is there;
 * - a duplicate panel key is dropped and reported;
 * - the cache is invalidated explicitly, because a plugin written by an install
 *   must appear without a restart.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  discoverPanelPlugins,
  findPanelDirBySlug,
  getMarketplaceCatalogPath,
  getMarketplaceDir,
  getMarketplacePluginsDir,
  invalidatePanelScan,
} from '@/server/lib/panels/registry.server';

let root = '';

const VALID = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  panels: [{ id: 'main', title: 'Demo Panel', position: 'right', entry: 'index.html', capabilities: ['theme'] }],
};

function writeCatalog(catalog: unknown): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getMarketplaceCatalogPath(), JSON.stringify(catalog));
}

function writePlugin(dirName: string, manifest: unknown): string {
  const dir = join(getMarketplacePluginsDir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, 'ompchamber.json'), JSON.stringify(manifest));
  fs.writeFileSync(join(dir, 'index.html'), '<html></html>');
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'ompchamber-marketplace-'));
  process.env.OMPCHAMBER_MARKETPLACE_DIR = root;
  invalidatePanelScan();
});

afterEach(() => {
  delete process.env.OMPCHAMBER_MARKETPLACE_DIR;
  invalidatePanelScan();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('getMarketplaceDir', () => {
  test('honours the override so a test never reads the real marketplace', () => {
    expect(getMarketplaceDir()).toBe(root);
    expect(getMarketplacePluginsDir()).toBe(join(root, 'plugins'));
  });
});

describe('discoverPanelPlugins', () => {
  test('a missing marketplace is one empty entry, not an error', async () => {
    fs.rmSync(root, { recursive: true, force: true });
    invalidatePanelScan();
    const payload = await discoverPanelPlugins();
    expect(payload.panels).toEqual([]);
    expect(payload.errors).toEqual([]);
    // The pane still names the marketplace, so its empty state can explain
    // where a plugin would go.
    expect(payload.marketplaces).toHaveLength(1);
    expect(payload.marketplaces[0].id).toBe('ompchamber');
  });

  test('a plugin is loaded and attributed to the marketplace', async () => {
    writeCatalog({ name: 'OMPChamber' });
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { panels, marketplaces, errors } = await discoverPanelPlugins();
    expect(errors).toEqual([]);
    expect(panels).toHaveLength(1);
    expect(panels[0].panelKey).toBe('plugin:demo/main');
    expect(panels[0].marketplace).toBe('ompchamber');
    expect(marketplaces[0].panelCount).toBe(1);
  });

  test('the catalog supplies the marketplace display name and description', async () => {
    writeCatalog({ name: 'Acme Tools', description: 'Internal panels.' });
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { marketplaces } = await discoverPanelPlugins();
    expect(marketplaces[0].name).toBe('Acme Tools');
    expect(marketplaces[0].description).toBe('Internal panels.');
  });

  test('a plugin absent from the catalog still loads', async () => {
    writeCatalog({ name: 'OMPChamber', plugins: [] });
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { panels, errors } = await discoverPanelPlugins();
    expect(panels.map((p) => p.panelKey)).toEqual(['plugin:demo/main']);
    expect(errors).toEqual([]);
  });

  test('a plugin loads with no catalog at all', async () => {
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { panels, marketplaces } = await discoverPanelPlugins();
    expect(panels).toHaveLength(1);
    expect(marketplaces[0].name).toBe('OMPChamber');
  });

  test('a catalog entry pointing at a missing directory is reported', async () => {
    writeCatalog({ plugins: [{ name: 'ghost', source: 'plugins/ghost' }] });
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('no plugin was found there');
    expect(errors[0].marketplace).toBe('ompchamber');
  });

  test('a catalog entry that escapes the marketplace root is refused', async () => {
    writeCatalog({ plugins: [{ name: 'evil', source: '../../etc' }] });
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors.some((e) => e.reason.includes('escapes the marketplace directory'))).toBe(true);
  });

  test('a catalog whose plugins is not an array is reported', async () => {
    writeCatalog({ plugins: 'nope' });
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors[0].reason).toContain('must be an array');
  });

  test('a catalog that is not JSON is reported', async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(getMarketplaceCatalogPath(), '{ not json');
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors[0].reason).toContain('not valid JSON');
  });

  test('a directory with no manifest is skipped silently', async () => {
    fs.mkdirSync(join(getMarketplacePluginsDir(), 'notes'), { recursive: true });
    fs.writeFileSync(join(getMarketplacePluginsDir(), 'notes', 'README.md'), 'scratch');
    writePlugin('demo', VALID);
    invalidatePanelScan();
    const { panels, errors } = await discoverPanelPlugins();
    expect(panels).toHaveLength(1);
    expect(errors.some((e) => e.dir.endsWith('notes'))).toBe(false);
  });

  test('reads the manifest from package.json#ompchamber as well', async () => {
    const dir = join(getMarketplacePluginsDir(), 'from-pkg');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', ompchamber: VALID }));
    invalidatePanelScan();
    const { panels } = await discoverPanelPlugins();
    expect(panels).toHaveLength(1);
  });

  test('a plugin whose entry escapes its directory is rejected by name', async () => {
    writePlugin('escape', { ...VALID, panels: [{ ...VALID.panels[0], entry: '../../etc/passwd' }] });
    invalidatePanelScan();
    const { panels, errors } = await discoverPanelPlugins();
    expect(panels).toEqual([]);
    expect(errors[0].reason).toContain('escapes the plugin directory');
  });

  test('a broken manifest is reported with its reason', async () => {
    writePlugin('broken', { id: 'broken', name: 'Broken', version: '1.0.0', panels: [] });
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors[0].reason).toContain('declares no panels');
  });

  test('a manifest that exists but is not JSON is reported', async () => {
    const dir = join(getMarketplacePluginsDir(), 'corrupt');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, 'ompchamber.json'), '{ not json');
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors[0].reason).toContain('not valid JSON');
  });

  test('an unknown capability is refused rather than dropped', async () => {
    writePlugin('bad-cap', { ...VALID, panels: [{ ...VALID.panels[0], capabilities: ['theme', 'root-shell'] }] });
    invalidatePanelScan();
    const { errors } = await discoverPanelPlugins();
    expect(errors[0].reason).toContain('unknown capability');
  });

  test('two plugins claiming one key: the second is dropped and reported', async () => {
    writePlugin('first', VALID);
    writePlugin('second', VALID);
    invalidatePanelScan();
    const { panels, errors } = await discoverPanelPlugins();
    expect(panels).toHaveLength(1);
    expect(errors.some((e) => e.reason.includes('duplicate panel id'))).toBe(true);
  });

  test('the payload carries no filesystem path, but the dir map resolves one', async () => {
    const dir = writePlugin('demo', VALID);
    invalidatePanelScan();
    const { panels } = await discoverPanelPlugins();
    expect(Object.keys(panels[0])).not.toContain('pluginDir');
    expect(await findPanelDirBySlug('demo~main')).toBe(dir);
    expect(await findPanelDirBySlug('nope~x')).toBeUndefined();
  });

  test('invalidatePanelScan makes a newly written plugin visible', async () => {
    writePlugin('demo', VALID);
    invalidatePanelScan();
    expect((await discoverPanelPlugins()).panels).toHaveLength(1);

    writePlugin('second', { ...VALID, id: 'second' });
    invalidatePanelScan();
    expect((await discoverPanelPlugins()).panels).toHaveLength(2);
  });
});
