/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seeding and installing, exercised against a real temp marketplace.
 *
 * The install path is tested end to end against a LOCAL git repository rather
 * than a mock: the failure modes that matter — a repository that is not a
 * plugin, a clone that leaves a partial directory, a catalog that cannot be
 * written — all live in the interaction between `git`, the filesystem and the
 * scan, and a stubbed `git` would exercise none of them.
 *
 * `Bun.which('git')` guards the suite: without git the install tests are
 * skipped rather than failing, because the chamber treats a missing git as an
 * environment condition, not a bug.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverPanelPlugins, getMarketplaceCatalogPath, invalidatePanelScan } from '@/server/lib/panels/registry.server';
import { installPanelPluginFromGit, isGitUrl, removePanelPlugin } from '@/server/lib/panels/install.server';
import { seedDefaultMarketplace } from '@/server/lib/panels/seed.server';

let root = '';
let work = '';

const VALID = {
  id: 'from-git',
  name: 'From Git',
  version: '2.0.0',
  description: 'Installed from a repository.',
  panels: [{ id: 'main', title: 'From Git', position: 'right', entry: 'index.html', capabilities: ['theme'] }],
};

/** Create a git repository holding a plugin, and return its path as a URL. */
function makePluginRepo(manifest: unknown, extra: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(join(work, 'repo-'));
  fs.writeFileSync(join(dir, 'ompchamber.json'), JSON.stringify(manifest));
  fs.writeFileSync(join(dir, 'index.html'), '<html></html>');
  for (const [name, content] of Object.entries(extra)) {
    const target = join(dir, name);
    fs.mkdirSync(join(target, '..'), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const run = (args: string[]) => Bun.spawnSync(['git', '-C', dir, ...args], { stdout: 'pipe', stderr: 'pipe' });
  run(['init', '-q']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Test']);
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'init']);
  return dir;
}

const hasGit = Boolean(Bun.which('git'));

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'ompchamber-seed-'));
  work = fs.mkdtempSync(join(tmpdir(), 'ompchamber-repos-'));
  process.env.OMPCHAMBER_MARKETPLACE_DIR = root;
  invalidatePanelScan();
});

afterEach(() => {
  delete process.env.OMPCHAMBER_MARKETPLACE_DIR;
  invalidatePanelScan();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

describe('isGitUrl', () => {
  test('accepts the three forms git clone understands', () => {
    expect(isGitUrl('https://github.com/a/b.git')).toBe(true);
    expect(isGitUrl('ssh://git@host/a/b.git')).toBe(true);
    expect(isGitUrl('git@github.com:a/b.git')).toBe(true);
  });

  test('accepts a local path and a file:// URL, which git clone also accepts', () => {
    expect(isGitUrl('/tmp/repo')).toBe(true);
    expect(isGitUrl('~/repos/panel')).toBe(true);
    expect(isGitUrl('file:///tmp/repo')).toBe(true);
  });

  test('refuses a bare name, an empty string and one with whitespace', () => {
    expect(isGitUrl('some-plugin')).toBe(false);
    expect(isGitUrl('   ')).toBe(false);
    expect(isGitUrl('https://a b/c')).toBe(false);
  });
});

describe('seedDefaultMarketplace', () => {
  test('copies the bundled marketplace and writes the marker', async () => {
    const bundled = fs.mkdtempSync(join(work, 'bundled-'));
    fs.mkdirSync(join(bundled, 'plugins', 'demo'), { recursive: true });
    fs.writeFileSync(join(bundled, 'marketplace.json'), JSON.stringify({ name: 'Bundled' }));
    fs.writeFileSync(join(bundled, 'plugins', 'demo', 'ompchamber.json'), JSON.stringify(VALID));

    const previous = process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
    process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = bundled;
    try {
      const result = await seedDefaultMarketplace();
      expect(result.seeded).toBe(true);
      expect(fs.existsSync(join(root, 'marketplace.json'))).toBe(true);
      expect(fs.existsSync(join(root, 'plugins', 'demo', 'ompchamber.json'))).toBe(true);
      expect(fs.existsSync(join(root, '.seeded'))).toBe(true);

      invalidatePanelScan();
      expect((await discoverPanelPlugins()).panels.map((p) => p.panelKey)).toEqual(['plugin:from-git/main']);
    } finally {
      if (previous === undefined) delete process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
      else process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = previous;
    }
  });

  test('a second run is a no-op, so a deleted plugin stays deleted', async () => {
    const bundled = fs.mkdtempSync(join(work, 'bundled-'));
    fs.mkdirSync(join(bundled, 'plugins', 'demo'), { recursive: true });
    fs.writeFileSync(join(bundled, 'plugins', 'demo', 'ompchamber.json'), JSON.stringify(VALID));

    const previous = process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
    process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = bundled;
    try {
      expect((await seedDefaultMarketplace()).seeded).toBe(true);
      // The user removes the plugin; the marker is what keeps it removed.
      fs.rmSync(join(root, 'plugins', 'demo'), { recursive: true, force: true });
      expect((await seedDefaultMarketplace()).seeded).toBe(false);
      expect(fs.existsSync(join(root, 'plugins', 'demo'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
      else process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = previous;
    }
  });

  test('a missing bundled marketplace reports why, without throwing', async () => {
    const previous = process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
    process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = join(work, 'nope');
    try {
      const result = await seedDefaultMarketplace();
      expect(result.seeded).toBe(false);
      expect(result.reason).toContain('no bundled marketplace');
    } finally {
      if (previous === undefined) delete process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR;
      else process.env.OMPCHAMBER_BUNDLED_MARKETPLACE_DIR = previous;
    }
  });
});

describe('installPanelPluginFromGit', () => {
  test('refuses a bare name before spawning anything', async () => {
    const result = await installPanelPluginFromGit('some-plugin');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('https');
  });

  test.skipIf(!hasGit)('installs a plugin, registering it in the catalog', async () => {
    const repo = makePluginRepo(VALID);
    const result = await installPanelPluginFromGit(repo);
    expect(result.ok).toBe(true);
    expect(result.pluginId).toBe('from-git');
    expect(fs.existsSync(join(root, 'plugins', 'from-git', 'ompchamber.json'))).toBe(true);

    const catalog = JSON.parse(fs.readFileSync(getMarketplaceCatalogPath(), 'utf8')) as {
      plugins: Array<{ name: string; source: string }>;
    };
    expect(catalog.plugins.map((p) => p.name)).toContain('from-git');
    expect(catalog.plugins.find((p) => p.name === 'from-git')?.source).toBe('plugins/from-git');

    invalidatePanelScan();
    const { panels, errors } = await discoverPanelPlugins();
    expect(errors).toEqual([]);
    expect(panels.map((p) => p.panelKey)).toEqual(['plugin:from-git/main']);
  });

  test.skipIf(!hasGit)('preserves the catalog it already had', async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      getMarketplaceCatalogPath(),
      JSON.stringify({ name: 'OMPChamber', description: 'keep me', plugins: [{ name: 'old', source: 'plugins/old' }] }),
    );
    const result = await installPanelPluginFromGit(makePluginRepo(VALID));
    expect(result.ok).toBe(true);

    const catalog = JSON.parse(fs.readFileSync(getMarketplaceCatalogPath(), 'utf8')) as {
      name: string;
      description: string;
      plugins: Array<{ name: string }>;
    };
    expect(catalog.name).toBe('OMPChamber');
    expect(catalog.description).toBe('keep me');
    expect(catalog.plugins.map((p) => p.name)).toEqual(['old', 'from-git']);
  });

  test.skipIf(!hasGit)('refuses a repository with no manifest, leaving nothing behind', async () => {
    const dir = fs.mkdtempSync(join(work, 'plain-'));
    fs.writeFileSync(join(dir, 'README.md'), 'not a plugin');
    const run = (args: string[]) => Bun.spawnSync(['git', '-C', dir, ...args], { stdout: 'pipe', stderr: 'pipe' });
    run(['init', '-q']);
    run(['config', 'user.email', 't@e.com']);
    run(['config', 'user.name', 'T']);
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'init']);

    const result = await installPanelPluginFromGit(dir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ompchamber.json');
    // Nothing in the marketplace, and no staging directory left in it either.
    const entries = fs.existsSync(join(root, 'plugins')) ? fs.readdirSync(join(root, 'plugins')) : [];
    expect(entries).toEqual([]);
    expect(fs.readdirSync(root).filter((n) => n.startsWith('.installing-'))).toEqual([]);
  });

  test.skipIf(!hasGit)('refuses a manifest that does not validate', async () => {
    const repo = makePluginRepo({ ...VALID, panels: [] });
    const result = await installPanelPluginFromGit(repo);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('declares no panels');
  });

  test.skipIf(!hasGit)('builds a Bun-package plugin before registering it', async () => {
    const repo = makePluginRepo(
      { ...VALID, panels: [{ ...VALID.panels[0], entry: 'dist/index.html' }] },
      {
        'package.json': JSON.stringify({
          name: 'from-git',
          version: '2.0.0',
          scripts: { build: 'bun build src/index.html --outdir dist --target browser' },
          ompchamber: { ...VALID, panels: [{ ...VALID.panels[0], entry: 'dist/index.html' }] },
        }),
        'src/index.html': '<!doctype html><html><body>built</body></html>',
      },
    );
    // Remove the plain manifest so the package's own `ompchamber` key is used.
    fs.rmSync(join(repo, 'ompchamber.json'));

    const result = await installPanelPluginFromGit(repo);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(join(root, 'plugins', 'from-git', 'dist', 'index.html'))).toBe(true);

    invalidatePanelScan();
    const { panels, plugins, errors } = await discoverPanelPlugins();
    expect(errors).toEqual([]);
    expect(panels.map((p) => p.panelKey)).toEqual(['plugin:from-git/main']);
    expect(plugins[0].built).toBe(true);
    expect(plugins[0].isPackage).toBe(true);
  });

  test.skipIf(!hasGit)('a package whose build fails stays installed but unregistered', async () => {
    const repo = makePluginRepo(
      { ...VALID, panels: [{ ...VALID.panels[0], entry: 'dist/index.html' }] },
      {
        'package.json': JSON.stringify({
          name: 'from-git',
          version: '2.0.0',
          scripts: { build: 'bun build src/missing.ts --outdir dist' },
          ompchamber: { ...VALID, panels: [{ ...VALID.panels[0], entry: 'dist/index.html' }] },
        }),
      },
    );
    fs.rmSync(join(repo, 'ompchamber.json'));

    const result = await installPanelPluginFromGit(repo);
    expect(result.ok).toBe(true);
    expect(result.error).toBeTruthy();
    // The directory is there so a Rebuild can fix it; the catalog was NOT
    // written, so the pane reports an unbuilt plugin rather than a dangling
    // catalog entry.
    expect(fs.existsSync(join(root, 'plugins', 'from-git'))).toBe(true);
    expect(fs.existsSync(getMarketplaceCatalogPath())).toBe(false);

    invalidatePanelScan();
    const { plugins } = await discoverPanelPlugins();
    expect(plugins[0].built).toBe(false);
    expect(plugins[0].reason).toContain('dist/index.html');
  });

  test.skipIf(!hasGit)('refuses an id that is already installed', async () => {
    const repo = makePluginRepo(VALID);
    expect((await installPanelPluginFromGit(repo)).ok).toBe(true);
    const again = await installPanelPluginFromGit(repo);
    expect(again.ok).toBe(false);
    expect(again.error).toContain('already installed');
  });
});

describe('removePanelPlugin', () => {
  test('removes the directory, the catalog entry, and drops the panel from the scan', async () => {
    fs.mkdirSync(join(root, 'plugins', 'from-git'), { recursive: true });
    fs.writeFileSync(join(root, 'plugins', 'from-git', 'ompchamber.json'), JSON.stringify(VALID));
    fs.writeFileSync(
      getMarketplaceCatalogPath(),
      JSON.stringify({ name: 'Keep', plugins: [{ name: 'from-git', source: 'plugins/from-git' }] }),
    );
    invalidatePanelScan();
    expect((await discoverPanelPlugins()).panels).toHaveLength(1);

    const result = await removePanelPlugin('from-git');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(join(root, 'plugins', 'from-git'))).toBe(false);

    // The catalog entry goes too: leaving it made every removal produce a
    // permanent "listed in marketplace.json but no plugin was found there" row.
    const catalog = JSON.parse(fs.readFileSync(getMarketplaceCatalogPath(), 'utf8')) as {
      name: string;
      plugins: unknown[];
    };
    expect(catalog.plugins).toEqual([]);
    expect(catalog.name).toBe('Keep');

    const after = await discoverPanelPlugins();
    expect(after.panels).toEqual([]);
    expect(after.errors).toEqual([]);
  });

  test('leaves other catalog entries alone', async () => {
    fs.mkdirSync(join(root, 'plugins', 'from-git'), { recursive: true });
    fs.writeFileSync(join(root, 'plugins', 'from-git', 'ompchamber.json'), JSON.stringify(VALID));
    fs.writeFileSync(
      getMarketplaceCatalogPath(),
      JSON.stringify({
        plugins: [
          { name: 'keep-me', source: 'plugins/keep-me' },
          { name: 'from-git', source: 'plugins/from-git' },
        ],
      }),
    );
    invalidatePanelScan();
    await removePanelPlugin('from-git');
    const catalog = JSON.parse(fs.readFileSync(getMarketplaceCatalogPath(), 'utf8')) as {
      plugins: Array<{ source: string }>;
    };
    expect(catalog.plugins.map((p) => p.source)).toEqual(['plugins/keep-me']);
  });

  test('refuses an id that is not installed', async () => {
    const result = await removePanelPlugin('nope');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No installed plugin');
  });

  test('refuses an id that would escape the plugins directory', async () => {
    const result = await removePanelPlugin('../../etc');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid plugin id');
  });
});
