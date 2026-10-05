/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel asset URLs and the slug they are built from.
 *
 * The mapping lives in one place because the route parses back what the host
 * writes: a slug spelled differently on either side is a 404 that looks like a
 * missing file, and the failure is silent from both ends.
 *
 * A panel key is `plugin:<pluginId>/<panelId>` and the slug is
 * `<pluginId>~<panelId>` — `/` is a path separator and `:` a scheme marker, so
 * neither may appear in a URL path segment, and `~` is unreserved.
 */

import { test, expect, describe } from 'bun:test';
import { panelAssetBase, panelAssetUrl, slugForPanelKey } from '@/shared/lib/panels/asset-base';

describe('slugForPanelKey', () => {
  test('strips the prefix and joins the two segments', () => {
    expect(slugForPanelKey('plugin:hello/greeter')).toBe('hello~greeter');
  });

  test('leaves a key without the prefix usable as-is', () => {
    expect(slugForPanelKey('plain')).toBe('plain');
  });

  test('only replaces the first slash, so a nested panel id survives', () => {
    expect(slugForPanelKey('plugin:a/b/c')).toBe('a~b/c');
  });
});

describe('panelAssetBase', () => {
  test('is a path ending in a slash, so relative URLs resolve', () => {
    const base = panelAssetBase('plugin:hello/greeter');
    expect(base.endsWith('/')).toBe(true);
    expect(base).toBe('/api/panels/file/hello~greeter/');
  });

  test('escapes a slug that needs it', () => {
    expect(panelAssetBase('plugin:a b/c d')).toContain('%20');
  });
});

describe('panelAssetUrl', () => {
  test('joins the base and an encoded relative path', () => {
    expect(panelAssetUrl('plugin:hello/greeter', 'assets/logo.svg')).toBe(
      '/api/panels/file/hello~greeter/assets/logo.svg',
    );
  });

  test('escapes each segment rather than the whole path', () => {
    expect(panelAssetUrl('plugin:hello/greeter', 'a b/c d.png')).toBe(
      '/api/panels/file/hello~greeter/a%20b/c%20d.png',
    );
  });
});
