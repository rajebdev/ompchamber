/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The plugin mark, and the fallback that makes an absent icon a CHOICE.
 *
 * `icon` is optional in the manifest, so a plugin may ship none — and the whole
 * reason this component exists is that the fallback must read as "this plugin
 * has no icon" rather than "something failed to load". The initials rule is
 * shared with the provider marks on purpose: a plugin badge and a provider badge
 * sitting in the same list must not look like two different systems.
 *
 * Rendered with `h()` (no JSX) against happy-dom.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { PluginMark } from '@/client/components/settings/categories/panel-plugins/PluginMark';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event'] as const;
/** The runner's own globals, restored on teardown — deleting them would strip
 *  natives (Event/CustomEvent) every later file needs. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

let container: HTMLElement;

// Installed per CASE, not per file: another suite's teardown can strip `window`
// mid-file when the runner interleaves files.
beforeEach(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (key in nativeGlobals) target[key] = nativeGlobals[key];
    else delete target[key];
  }
});

function paint(node: ComponentChild) {
  act(() => {
    render(node, container);
  });
  return container;
}

describe('PluginMark', () => {
  test('draws the icon at the requested box, not the file’s own size', () => {
    // A plugin's SVG may carry its own width/height attributes; trusting them
    // would break the grid, so the element is constrained instead.
    const el = paint(h(PluginMark, { name: 'Demo', iconUrl: '/api/panels/icon/demo/icon.svg', size: 16 }));
    const img = el.querySelector('img');

    expect(img?.getAttribute('src')).toBe('/api/panels/icon/demo/icon.svg');
    expect(img?.style.width).toBe('16px');
    expect(img?.style.height).toBe('16px');
    // Decorative: the plugin's name is always rendered beside it.
    expect(img?.getAttribute('aria-hidden')).toBe('true');
  });

  test('falls back to the plugin initials when no icon is declared', () => {
    const el = paint(h(PluginMark, { name: 'Session Info', size: 16 }));

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('si.');
  });

  test('follows the shared initials rule for slugs and single words', () => {
    expect(paint(h(PluginMark, { name: 'toktok-id' })).textContent).toBe('ti.');
    expect(paint(h(PluginMark, { name: 'Tooker' })).textContent).toBe('t.');
  });

  test('renders a visible badge for a plugin with no usable name', () => {
    // A blank box would read as a broken plugin rather than an unnamed one.
    expect(paint(h(PluginMark, { name: '' })).textContent).toBe('?');
  });

  test('the tile variant adds a background and keeps the initials', () => {
    const el = paint(h(PluginMark, { name: 'Quick Notes', size: 36, tile: true }));
    const badge = el.querySelector('span');

    expect(badge?.className).toContain('bg-ink/5');
    expect(badge?.className).toContain('rounded');
    expect(el.textContent).toBe('qn.');
  });

  test('the plain variant draws no background, for a toolbar button', () => {
    const badge = paint(h(PluginMark, { name: 'Demo' })).querySelector('span');
    expect(badge?.className).not.toContain('bg-ink/5');
  });
});
