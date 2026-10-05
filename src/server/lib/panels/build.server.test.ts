/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The plugin builder.
 *
 * The distinction these tests exist to pin is `not-a-package` vs `failed`: a
 * hand-written HTML plugin must install and serve as-is, while a package whose
 * build breaks must not register. Collapsing them into one false answer made
 * every non-package plugin refuse to install — which is the bug the first
 * version shipped.
 *
 * A real `bun build` runs against a real temp package: the failure modes that
 * matter (a bad import, a missing output, an entry the manifest names that the
 * build never emits) live in the interaction between the build, the filesystem
 * and the manifest, and a stubbed builder would exercise none of them.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildPanelPlugin,
  describeInstallFailure,
  linkChamberPackages,
  PLUGIN_BUILD_DIR,
} from '@/server/lib/panels/build.server';
import type { PanelPluginManifest } from '@/shared/types';

let root = '';

const manifest: PanelPluginManifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  panels: [{ id: 'main', title: 'Demo', position: 'right', entry: `${PLUGIN_BUILD_DIR}/index.html`, capabilities: [] }],
};

function writeFile(relative: string, content: string): void {
  const target = join(root, relative);
  fs.mkdirSync(join(target, '..'), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'ompchamber-build-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('buildPanelPlugin', () => {
  test('a directory with no package.json is not-a-package, not a failure', async () => {
    writeFile('index.html', '<html></html>');
    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('not-a-package');
  });

  test('a package.json with neither a build script nor a known entry is not-a-package', async () => {
    writeFile('package.json', JSON.stringify({ name: 'x', version: '1.0.0' }));
    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('not-a-package');
  });

  test('builds an HTML entry with no build script at all', async () => {
    writeFile('package.json', JSON.stringify({ name: 'x', version: '1.0.0' }));
    writeFile('src/index.html', '<!doctype html><html><body><script src="./main.ts"></script></body></html>');
    writeFile('src/main.ts', 'document.body.dataset.ready = "yes";');

    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('built');
    expect(fs.existsSync(join(root, PLUGIN_BUILD_DIR, 'index.html'))).toBe(true);
  });

  test('runs an explicit build script and honours its output', async () => {
    writeFile(
      'package.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        scripts: { build: 'bun build src/index.html --outdir dist --target browser' },
      }),
    );
    writeFile('src/index.html', '<!doctype html><html><body>built</body></html>');

    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('built');
    const html = fs.readFileSync(join(root, PLUGIN_BUILD_DIR, 'index.html'), 'utf8');
    expect(html).toContain('built');
  });

  test('a failing build script reports failed with the compiler message', async () => {
    writeFile(
      'package.json',
      JSON.stringify({ name: 'x', version: '1.0.0', scripts: { build: 'bun build src/missing.ts --outdir dist' } }),
    );
    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('failed');
    expect(result.reason).toBeTruthy();
  });

  test('a build that produces no entry the manifest names is failed', async () => {
    writeFile(
      'package.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        scripts: { build: 'bun build src/index.html --outdir dist --target browser' },
      }),
    );
    writeFile('src/index.html', '<!doctype html><html><body>ok</body></html>');

    // The manifest names a second document the build never emits.
    const demanding: PanelPluginManifest = {
      ...manifest,
      panels: [
        ...manifest.panels,
        { id: 'extra', title: 'Extra', position: 'editor', entry: `${PLUGIN_BUILD_DIR}/extra.html`, capabilities: [] },
      ],
    };
    const result = await buildPanelPlugin(root, demanding);
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('extra.html');
  });

  test('a stale dist is replaced, not merged', async () => {
    writeFile('package.json', JSON.stringify({ name: 'x', version: '1.0.0' }));
    writeFile('src/index.html', '<!doctype html><html><body>fresh</body></html>');
    writeFile(`${PLUGIN_BUILD_DIR}/stale.html`, '<html>from a previous build</html>');

    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('built');
    expect(fs.existsSync(join(root, PLUGIN_BUILD_DIR, 'stale.html'))).toBe(false);
  });
});

describe('linkChamberPackages', () => {
  test('links each @ompchamber package once, keyed by package not specifier', async () => {
    await linkChamberPackages(root);
    const scope = join(root, 'node_modules', '@ompchamber');
    if (!fs.existsSync(scope)) return; // no chamber packages resolvable in this environment
    const entries = fs.readdirSync(scope).sort();
    // `@ompchamber/ui` and `@ompchamber/ui/components` are ONE package, so the
    // second must not have replaced the first with its own directory.
    expect(entries).toEqual([...new Set(entries)]);
    for (const entry of entries) {
      const target = join(scope, entry);
      expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(join(target, 'package.json'))).toBe(true);
    }
  });

  test('is a no-op when the plugin has no node_modules to link into', async () => {
    // The directory is created, not required: a plugin that imports nothing from
    // the chamber still builds, so a missing node_modules must not throw.
    await expect(linkChamberPackages(join(root, 'nested'))).resolves.toBeUndefined();
  });
});

describe('describeInstallFailure', () => {
  test('picks the error line, not the usage banner that follows it', () => {
    // The real shape of a failed `bun install`: the error first, then the banner
    // and the package.json script list. Taking the LAST line reported
    // `$ bun run build` as the reason a plugin could not install.
    const stderr = [
      'error: GET https://registry.npmjs.org/@ompchamber%2Fui - 404',
      '',
      'error: @ompchamber/ui@^1.0.0 failed to resolve',
      '',
      'Bun v1.4.2 (macOS arm64)',
      '',
    ].join('\n');
    expect(describeInstallFailure(stderr, undefined)).toBe(
      'error: GET https://registry.npmjs.org/@ompchamber%2Fui - 404',
    );
  });

  test('falls back to the first substantive line when there is no error line', () => {
    expect(describeInstallFailure('Resolving dependencies\nsomething went wrong\n', undefined)).toBe(
      'something went wrong',
    );
  });

  test('reports a plain failure when there is nothing to read', () => {
    expect(describeInstallFailure(undefined, undefined)).toBe('bun install failed');
  });
});

describe('optional peer dependencies', () => {
  test('a plugin declaring @ompchamber/* as optional peers builds against the links', async () => {
    writeFile(
      'package.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        scripts: { build: 'bun build src/index.html --outdir dist --target browser' },
        peerDependencies: { '@ompchamber/ui': '*' },
        peerDependenciesMeta: { '@ompchamber/ui': { optional: true } },
      }),
    );
    writeFile('src/index.html', '<!doctype html><html><body>ok</body></html>');
    const result = await buildPanelPlugin(root, manifest);
    // The peer is absent from npm, so an install that tried to fetch it would
    // fail here — this is the regression guard for declaring it as a dependency.
    expect(result.status).toBe('built');
  });
});

describe('peer dependency declaration', () => {
  test('an optional peer that is absent from the registry does not fail the install', async () => {
    // The package below does not exist on npm, so any form that FETCHES it fails
    // here. `dependencies` and a non-optional peer both exit 1 (measured on Bun
    // 1.4.2); only the `optional` flag installs and builds.
    writeFile(
      'package.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        scripts: { build: 'bun build src/index.html --outdir dist --target browser' },
        peerDependencies: { '@ompchamber/definitely-not-published': '*' },
        peerDependenciesMeta: { '@ompchamber/definitely-not-published': { optional: true } },
      }),
    );
    writeFile('src/index.html', '<!doctype html><html><body>ok</body></html>');

    const result = await buildPanelPlugin(root, manifest);
    expect(result.status).toBe('built');
  });
});
