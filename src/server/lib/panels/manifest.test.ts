/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manifest and catalog validation.
 *
 * Every rule here is a refusal, and a refusal is exactly the kind of answer that
 * goes unnoticed when it is wrong — a plugin that fails to load with no reason
 * reads as a plugin that was never installed. So each rejection is pinned with
 * the sentence the UI will show.
 */

import { test, expect, describe } from 'bun:test';
import { toContribution, toManifest, toMarketplaceCatalog } from '@/server/lib/panels/manifest';

const ROOT = '/market/plugins/demo';

const PANEL = {
  id: 'main',
  title: 'Demo',
  position: 'right',
  entry: 'index.html',
  capabilities: ['theme'],
};

describe('toContribution', () => {
  test('accepts a minimal panel and defaults capabilities to none', () => {
    const result = toContribution({ id: 'main', title: 'Demo', position: 'right', entry: 'a.html' }, ROOT);
    expect(result).toMatchObject({ id: 'main', capabilities: [] });
  });

  test('keeps optional sizing when it is a positive number', () => {
    const result = toContribution({ ...PANEL, minWidth: 400, defaultFraction: 0.5 }, ROOT);
    expect(result).toMatchObject({ minWidth: 400, defaultFraction: 0.5 });
  });

  test('drops non-positive sizing rather than writing it', () => {
    const result = toContribution({ ...PANEL, minWidth: 0, defaultFraction: -1 }, ROOT);
    expect(result).not.toHaveProperty('minWidth');
    expect(result).not.toHaveProperty('defaultFraction');
  });

  test('refuses a missing or malformed id', () => {
    expect(toContribution({ ...PANEL, id: undefined }, ROOT)).toMatchObject({ error: expect.stringContaining('id') });
    expect(toContribution({ ...PANEL, id: 'a b' }, ROOT)).toMatchObject({ error: expect.stringContaining('invalid') });
  });

  test('refuses an unknown position', () => {
    expect(toContribution({ ...PANEL, position: 'bottom' }, ROOT)).toMatchObject({
      error: expect.stringContaining('position must be'),
    });
  });

  test('refuses an entry escaping the plugin root', () => {
    expect(toContribution({ ...PANEL, entry: '../x.html' }, ROOT)).toMatchObject({
      error: expect.stringContaining('escapes the plugin directory'),
    });
  });

  test('refuses an absolute entry', () => {
    expect(toContribution({ ...PANEL, entry: '/etc/passwd' }, ROOT)).toMatchObject({
      error: expect.stringContaining('escapes the plugin directory'),
    });
  });

  test('refuses an icon escaping the root', () => {
    expect(toContribution({ ...PANEL, icon: '../../x.svg' }, ROOT)).toMatchObject({
      error: expect.stringContaining('escapes the plugin directory'),
    });
  });

  test('refuses an unknown capability instead of dropping it', () => {
    expect(toContribution({ ...PANEL, capabilities: ['theme', 'nope'] }, ROOT)).toMatchObject({
      error: expect.stringContaining('unknown capability'),
    });
  });

  test('refuses a non-array capabilities field', () => {
    expect(toContribution({ ...PANEL, capabilities: 'theme' }, ROOT)).toMatchObject({
      error: expect.stringContaining('unknown capability'),
    });
  });

  test('de-duplicates a repeated capability', () => {
    const result = toContribution({ ...PANEL, capabilities: ['theme', 'theme'] }, ROOT);
    expect(result).toMatchObject({ capabilities: ['theme'] });
  });
});

describe('toManifest', () => {
  const MANIFEST = { id: 'demo', name: 'Demo', version: '1.0.0', panels: [PANEL] };

  test('accepts a valid manifest', () => {
    expect(toManifest(MANIFEST, ROOT)).toMatchObject({ id: 'demo', panels: [expect.objectContaining({ id: 'main' })] });
  });

  test('refuses a manifest with no panels', () => {
    expect(toManifest({ ...MANIFEST, panels: [] }, ROOT)).toMatchObject({
      error: expect.stringContaining('declares no panels'),
    });
  });

  test('refuses a missing version', () => {
    expect(toManifest({ ...MANIFEST, version: undefined }, ROOT)).toMatchObject({
      error: expect.stringContaining('version'),
    });
  });

  test('propagates a panel-level refusal', () => {
    expect(toManifest({ ...MANIFEST, panels: [{ ...PANEL, entry: '../x' }] }, ROOT)).toMatchObject({
      error: expect.stringContaining('escapes the plugin directory'),
    });
  });

  test('refuses a non-object body', () => {
    expect(toManifest('nope', ROOT)).toMatchObject({ error: expect.stringContaining('not an object') });
  });
});

describe('toMarketplaceCatalog', () => {
  test('accepts a catalog with no plugins array as empty', () => {
    expect(toMarketplaceCatalog({ name: 'Acme' }, ROOT)).toMatchObject({ name: 'Acme', plugins: [] });
  });

  test('accepts an empty object', () => {
    expect(toMarketplaceCatalog({}, ROOT)).toMatchObject({ plugins: [] });
  });

  test('keeps a valid entry with its metadata', () => {
    const result = toMarketplaceCatalog(
      { plugins: [{ name: 'demo', source: 'plugins/demo', description: 'd', category: 'tools' }] },
      ROOT,
    );
    expect(result).toMatchObject({ plugins: [{ name: 'demo', source: 'plugins/demo', category: 'tools' }] });
  });

  test('refuses an entry with no source', () => {
    expect(toMarketplaceCatalog({ plugins: [{ name: 'demo' }] }, ROOT)).toMatchObject({
      error: expect.stringContaining('has no source'),
    });
  });

  test('refuses a source escaping the marketplace root', () => {
    expect(toMarketplaceCatalog({ plugins: [{ name: 'evil', source: '../../etc' }] }, ROOT)).toMatchObject({
      error: expect.stringContaining('escapes the marketplace directory'),
    });
  });

  test('refuses a non-array plugins field', () => {
    expect(toMarketplaceCatalog({ plugins: 'x' }, ROOT)).toMatchObject({
      error: expect.stringContaining('must be an array'),
    });
  });

  test('refuses a non-object body', () => {
    expect(toMarketplaceCatalog(null, ROOT)).toMatchObject({ error: expect.stringContaining('not an object') });
  });
});
