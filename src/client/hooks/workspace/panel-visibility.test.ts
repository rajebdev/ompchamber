/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The activity bar's visibility store.
 *
 * Hiding a view is only safe because it is REVERSIBLE, and the whole store
 * exists to make it so: the hidden set is persisted, it is announced so both
 * layouts re-read it, and a value written for a view the user no longer has is
 * harmless. The two properties pinned here are the ones a wrong answer makes
 * silent — a write that did not reach storage (the view reappears on reload) and
 * a write that did not reach the other layout (the phone keeps showing it).
 *
 * The chamber settings module keeps a module-level snapshot, so each case primes
 * it rather than trusting the previous test's state.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { PANEL_VISIBILITY_EVENT, useHiddenPanels } from '@/client/hooks/workspace/panel-visibility';
import { primeChamberSettings } from '@/shared/lib/settings/client';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};
const nativeFetch = Bun.fetch;

/** The settings POSTs this file causes, in order. */
let posts: { url: string; body: unknown }[] = [];

beforeEach(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
  posts = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (init?.body) posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;
});

afterEach(() => {
  renderNothing();
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (key in nativeGlobals) target[key] = nativeGlobals[key];
    else delete target[key];
  }
  globalThis.fetch = nativeFetch;
});

/** There is no component to unmount — the hook is driven through a harness. */
function renderNothing(): void {
  // Kept as a named seam so the teardown order is explicit.
}

/**
 * Drive the hook outside a component tree.
 *
 * The hook is pure state plus a subscription, so a tiny harness is enough — and
 * it exercises the real `useState`/`useEffect` path rather than a copy of it.
 */
async function withHook<T>(run: (read: () => string[], write: (next: string[]) => void) => T): Promise<T> {
  const { h, render } = await import('preact');
  const { act } = await import('preact/test-utils');
  const container = document.createElement('div');
  document.body.appendChild(container);

  let read: () => string[] = () => [];
  let write: (next: string[]) => void = () => {};

  function Harness() {
    const [hidden, setHidden] = useHiddenPanels();
    read = () => hidden;
    write = setHidden;
    return null;
  }

  await act(async () => {
    render(h(Harness, {}), container);
  });

  const result = await run(read, write);

  await act(async () => {
    render(null, container);
  });
  container.remove();
  return result;
}

/** The hidden ids a settings write carried, if any. */
function hiddenFromPosts(): string[] | undefined {
  for (const post of posts) {
    const blob = (post.body as { omp_chamber_settings?: { hiddenRightPanels?: string[] } }).omp_chamber_settings;
    if (blob?.hiddenRightPanels) return blob.hiddenRightPanels;
  }
  return undefined;
}

describe('useHiddenPanels', () => {
  test('reads the stored set, and defaults to nothing hidden', async () => {
    primeChamberSettings({});
    expect(await withHook((read) => read())).toEqual([]);

    primeChamberSettings({ omp_chamber_settings: { hiddenRightPanels: ['files', 'plugin:demo'] } });
    expect(await withHook((read) => read())).toEqual(['files', 'plugin:demo']);
  });

  test('a malformed stored value degrades to nothing hidden', async () => {
    // A settings row is user-editable and may predate this feature; refusing to
    // render the bar because of it would be a far worse answer.
    primeChamberSettings({ omp_chamber_settings: { hiddenRightPanels: 'files' } });
    expect(await withHook((read) => read())).toEqual([]);

    primeChamberSettings({ omp_chamber_settings: { hiddenRightPanels: ['files', 7, null] } });
    expect(await withHook((read) => read())).toEqual(['files']);
  });

  test('a write persists the whole set, not just the change', async () => {
    primeChamberSettings({ omp_chamber_settings: { hiddenRightPanels: ['files'] } });
    const next = await withHook((_read, write) => {
      write(['files', 'plugin:demo']);
      return undefined;
    });
    expect(next).toBeUndefined();

    expect(hiddenFromPosts()).toEqual(['files', 'plugin:demo']);
  });

  test('a write announces itself, so the other layout re-reads', async () => {
    // The desktop bar and the phone's tab bar read the same store; without the
    // event one of them keeps drawing the view the user just hid.
    primeChamberSettings({});
    let heard = 0;
    window.addEventListener(PANEL_VISIBILITY_EVENT, () => heard++);

    await withHook((_read, write) => write(['files']));
    expect(heard).toBe(1);

    window.removeEventListener(PANEL_VISIBILITY_EVENT, () => heard++);
  });

  test('the stored value survives a remount', async () => {
    primeChamberSettings({ omp_chamber_settings: { hiddenRightPanels: ['git'] } });
    await withHook((_read, write) => write(['git', 'search']));

    // A fresh mount reads what the write stored, which is what makes hiding
    // reversible across a reload rather than a per-render accident.
    expect(await withHook((read) => read())).toEqual(['git', 'search']);
  });
});
