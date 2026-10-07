/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The overlay-scrollbar fade, which is a CLASS on the scroll container rather
 * than a flag in component state.
 *
 * That is the whole point of the hook, so it is what these cases pin: the
 * element carries the scrolling class while the user scrolls and the idle one
 * after the cool-down, a scroll during the cool-down extends it, and a timer
 * left pending at unmount is cleared rather than firing into a detached
 * element. A state-based version re-rendered its owner on every scroll event,
 * which on a long list meant re-rendering every row.
 *
 * Mounted with `h()` against happy-dom, the same way the other hook tests do.
 */

import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { useScrollbarFadeRef, type ScrollbarFadeProps } from '@/client/hooks/ui/scrollbar-fade';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
/** The runner's own globals, restored on teardown so later files still see native Event/CustomEvent/window. */
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

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  jest.useRealTimers();
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});

function mount(vnode: Parameters<typeof render>[0]) {
  container ??= document.body.appendChild(document.createElement('div'));
  act(() => {
    render(vnode, container as HTMLElement);
  });
}

function FadeProbe({ delayMs, seen }: { delayMs: number; seen: { current: ScrollbarFadeProps | null } }) {
  const fade = useScrollbarFadeRef(delayMs);
  seen.current = fade;
  return h('span', { ref: fade.ref }, 'fade');
}

/** A fresh probe plus the element it is attached to, which is what the cases act on. */
function setup(delayMs = 100) {
  const seen: { current: ScrollbarFadeProps | null } = { current: null };
  mount(h(FadeProbe, { delayMs, seen }));
  const element = document.createElement('div');
  seen.current!.ref(element);
  return { fade: () => seen.current!, element };
}

describe('useScrollbarFadeRef', () => {
  test('lights on scroll and clears after the delay', () => {
    jest.useFakeTimers();
    const { fade, element } = setup();

    act(() => fade().onScroll());
    expect(element.classList.contains('scrollbar-overlay-scrolling')).toBe(true);
    expect(element.classList.contains('scrollbar-overlay')).toBe(false);

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(element.classList.contains('scrollbar-overlay-scrolling')).toBe(false);
    expect(element.classList.contains('scrollbar-overlay')).toBe(true);
  });

  test('a scroll during the cool-down extends the fade', () => {
    jest.useFakeTimers();
    const { fade, element } = setup();

    act(() => fade().onScroll());
    act(() => {
      jest.advanceTimersByTime(70);
    });
    act(() => fade().onScroll());
    act(() => {
      jest.advanceTimersByTime(70);
    });
    expect(element.classList.contains('scrollbar-overlay-scrolling')).toBe(true);

    act(() => {
      jest.advanceTimersByTime(30);
    });
    expect(element.classList.contains('scrollbar-overlay-scrolling')).toBe(false);
  });

  test('the element starts on the idle class, whatever it carried before', () => {
    const { fade, element } = setup();
    element.classList.add('scrollbar-overlay-scrolling');
    const next = document.createElement('div');
    next.classList.add('scrollbar-overlay-scrolling');
    fade().ref(next);

    expect(next.classList.contains('scrollbar-overlay')).toBe(true);
    expect(next.classList.contains('scrollbar-overlay-scrolling')).toBe(false);
  });

  test('a scroll before the element is attached is a no-op', () => {
    const seen: { current: ScrollbarFadeProps | null } = { current: null };
    mount(h(FadeProbe, { delayMs: 100, seen }));

    expect(() => act(() => seen.current!.onScroll())).not.toThrow();
  });

  test('swapping the element leaves the previous one idle', () => {
    jest.useFakeTimers();
    const { fade, element } = setup();
    act(() => fade().onScroll());

    fade().ref(document.createElement('div'));

    expect(element.classList.contains('scrollbar-overlay-scrolling')).toBe(false);
    expect(element.classList.contains('scrollbar-overlay')).toBe(true);
  });

  test('a pending fade is dropped on unmount', () => {
    jest.useFakeTimers();
    const { fade } = setup();
    act(() => fade().onScroll());

    render(null, container as HTMLElement);
    // The timer was cleared, so nothing is left queued to fire.
    expect(jest.getTimerCount()).toBe(0);
  });
});
