/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A long diff must SCROLL inside its height ceiling.
 *
 * The bug: the wrapper carried only `max-h-72 overflow-hidden`, and the panel
 * views resolve `h-full` against their parent. `height: 100%` against a box
 * whose height is `auto` resolves to `auto`, so the view grew to its full
 * content — measured 1521px inside a 288px parent — and `overflow-hidden`
 * clipped the rest. `scrollHeight === clientHeight`, so nothing could scroll
 * and the reader simply could not reach the bottom of the diff.
 *
 * Asserted on the classes the fix depends on, because the failure mode is a
 * LAYOUT resolution that happy-dom does not compute: `min-h-0` on a flex column
 * is what gives the child a definite height, and `overflow-hidden` on the
 * wrapper is what stops a second scroller from appearing.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { DiffView } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/DiffView';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};
let container: HTMLElement;

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});

/** omp's excerpt diff, long enough to overflow any ceiling. */
const EXCERPT = Array.from({ length: 120 }, (_, i) => `${i + 1}|line ${i + 1}`).join('\n');

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(h(DiffView, { text: EXCERPT, path: 'src/x.ts' }), container);
  });
  return container;
}

describe('DiffView height ceiling', () => {
  test('the bounding wrapper does not scroll itself', async () => {
    const el = await mount();
    const wrap = el.querySelector('div[class*="max-h-72"]') as HTMLElement;
    expect(wrap).not.toBeNull();
    // `overflow-hidden`: the view inside is the scroller. Two scrollers stacked
    // means one of them eats the wheel event.
    expect(wrap.className).toContain('overflow-hidden');
    expect(wrap.className).not.toContain('overflow-auto');
  });

  test('the wrapper is a flex column with min-h-0, so the view gets a definite height', async () => {
    const el = await mount();
    const wrap = el.querySelector('div[class*="max-h-72"]') as HTMLElement;
    expect(wrap.className).toContain('flex');
    expect(wrap.className).toContain('flex-col');
    // Without `min-h-0` a flex item refuses to shrink below its content, the
    // view's `h-full` resolves to `auto`, and nothing scrolls.
    expect(wrap.className).toContain('min-h-0');
  });

  test('the view inside is the element that scrolls', async () => {
    const el = await mount();
    const wrap = el.querySelector('div[class*="max-h-72"]') as HTMLElement;
    const view = wrap.firstElementChild as HTMLElement;
    expect(view.className).toContain('overflow-auto');
    expect(view.className).toContain('h-full');
  });

  test('a short diff still renders its rows', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(h(DiffView, { text: ' 1|a\n-2|b\n+2|c', path: 'src/x.ts' }), container);
    });
    expect(container.textContent).toContain('c');
    expect(container.textContent).not.toContain('2|b');
  });
});
