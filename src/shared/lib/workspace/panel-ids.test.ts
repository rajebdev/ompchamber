/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel id guards: what a stored `layout.activeRightPanel` and a width-map key
 * are allowed to be.
 *
 * These predicates are the only thing standing between a persisted blob and a
 * layout that renders a view nobody asked for, so the interesting cases are the
 * near-misses: a bare prefix, a stray segment, a non-string.
 */

import { test, expect, describe } from 'bun:test';
import { isPanelId, pluginIdOf, pluginKeyOf, pluginPanelKey } from '@/shared/lib/workspace/panel-ids';

describe('pluginPanelKey', () => {
  test('builds the id from the plugin id', () => {
    expect(pluginPanelKey('hello')).toBe('plugin:hello');
  });
});

describe('pluginKeyOf', () => {
  test('accepts a well-formed plugin key', () => {
    expect(pluginKeyOf('plugin:hello')).toBe('plugin:hello');
  });

  test('rejects a bare prefix and an extra segment', () => {
    expect(pluginKeyOf('plugin:')).toBeNull();
    // The id used to carry a panel segment; a blob written then must not be
    // adopted as a plugin id that no registry can report.
    expect(pluginKeyOf('plugin:hello/greeter')).toBeNull();
  });

  test('rejects a built-in view id and a non-string', () => {
    expect(pluginKeyOf('files')).toBeNull();
    expect(pluginKeyOf(7)).toBeNull();
    expect(pluginKeyOf(null)).toBeNull();
  });
});

describe('pluginIdOf', () => {
  test('unwraps the plugin id', () => {
    expect(pluginIdOf('plugin:hello')).toBe('hello');
    expect(pluginIdOf('files')).toBeNull();
  });
});

describe('isPanelId', () => {
  test('accepts every built-in view', () => {
    expect(isPanelId('files')).toBe(true);
    expect(isPanelId('wiki')).toBe(true);
    expect(isPanelId('plan')).toBe(true);
  });

  test('accepts a plugin key', () => {
    expect(isPanelId('plugin:hello')).toBe(true);
  });

  test('rejects an unknown view and a malformed plugin key', () => {
    expect(isPanelId('nope')).toBe(false);
    expect(isPanelId('plugin:')).toBe(false);
    expect(isPanelId(undefined)).toBe(false);
  });
});
