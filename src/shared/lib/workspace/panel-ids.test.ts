/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel id guards: what a stored `layout.activeRightPanel` and a width-map key
 * are allowed to be.
 *
 * These two predicates are the only thing standing between a persisted blob and
 * a layout that renders a view nobody asked for, so the interesting cases are
 * the near-misses: a bare prefix, a missing panel segment, a non-string.
 */

import { test, expect, describe } from 'bun:test';
import { isPanelId, pluginKeyOf, pluginPanelKey } from '@/shared/lib/workspace/panel-ids';

describe('pluginPanelKey', () => {
  test('builds the id from the two segments', () => {
    expect(pluginPanelKey('hello', 'greeter')).toBe('plugin:hello/greeter');
  });
});

describe('pluginKeyOf', () => {
  test('accepts a well-formed plugin key', () => {
    expect(pluginKeyOf('plugin:hello/greeter')).toBe('plugin:hello/greeter');
  });

  test('rejects a bare prefix and an empty panel segment', () => {
    expect(pluginKeyOf('plugin:')).toBeNull();
    expect(pluginKeyOf('plugin:hello')).toBeNull();
    expect(pluginKeyOf('plugin:hello/')).toBeNull();
  });

  test('rejects a built-in view id and a non-string', () => {
    expect(pluginKeyOf('files')).toBeNull();
    expect(pluginKeyOf(7)).toBeNull();
    expect(pluginKeyOf(null)).toBeNull();
  });
});

describe('isPanelId', () => {
  test('accepts every built-in view', () => {
    expect(isPanelId('files')).toBe(true);
    expect(isPanelId('wiki')).toBe(true);
    expect(isPanelId('plan')).toBe(true);
  });

  test('accepts a plugin key', () => {
    expect(isPanelId('plugin:hello/greeter')).toBe(true);
  });

  test('rejects an unknown view and a malformed plugin key', () => {
    expect(isPanelId('nope')).toBe(false);
    expect(isPanelId('plugin:hello')).toBe(false);
    expect(isPanelId(undefined)).toBe(false);
  });
});
