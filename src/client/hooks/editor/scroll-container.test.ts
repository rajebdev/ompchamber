/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The scroll-container walk, shared by the editor's lazy window and the find
 * widget's reveal.
 *
 * The two must agree: one resolves which lines to draw from the visible band,
 * the other moves that band. Two copies of this walk would let the widget scroll
 * a container the window never reads — the match would be marked somewhere
 * nobody can see. Exercised against a real DOM (happy-dom) because the answer is
 * a computed style.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { findScrollContainer } from '@/client/hooks/editor/scroll-container';

const installed: Record<string, unknown> = {};
const displaced: Record<string, unknown> = {};

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'getComputedStyle']) {
    displaced[key] = (globalThis as Record<string, unknown>)[key];
    installed[key] = (win as unknown as Record<string, unknown>)[key];
    (globalThis as Record<string, unknown>)[key] = installed[key];
  }
});

afterAll(() => {
  for (const key of Object.keys(installed)) {
    if (displaced[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = displaced[key];
  }
});

/** An element whose computed style reports `overflow-y`, with a scrollable height. */
function makeElement(overflowY: string, scrollable: boolean): HTMLElement {
  const element = document.createElement('div');
  element.style.overflowY = overflowY;
  if (scrollable) {
    // happy-dom reports clientHeight 0, so the walk's `scrollHeight > clientHeight`
    // test needs a stubbed pair to describe a container that can actually scroll.
    Object.defineProperty(element, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: 100, configurable: true });
  }
  return element;
}

describe('findScrollContainer', () => {
  test('finds the nearest ancestor that scrolls', () => {
    const outer = makeElement('auto', true);
    const inner = makeElement('visible', false);
    const surface = document.createElement('div');
    inner.appendChild(surface);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    expect(findScrollContainer(surface)).toBe(outer);
    outer.remove();
  });

  test('skips a container that cannot actually scroll', () => {
    // `overflow: auto` on a box whose content fits is not a scroller: returning
    // it would make `revealOffset` write scrollTop onto a box that ignores it.
    const outer = makeElement('auto', true);
    const fitted = makeElement('auto', false);
    const surface = document.createElement('div');
    fitted.appendChild(surface);
    outer.appendChild(fitted);
    document.body.appendChild(outer);

    expect(findScrollContainer(surface)).toBe(outer);
    outer.remove();
  });

  test('reports nothing when no ancestor scrolls', () => {
    const plain = document.createElement('div');
    const surface = document.createElement('div');
    plain.appendChild(surface);
    document.body.appendChild(plain);

    expect(findScrollContainer(surface)).toBeNull();
    plain.remove();
  });

  test('prefers the nearest scroller, so a nested panel scrolls itself', () => {
    const outer = makeElement('auto', true);
    const inner = makeElement('scroll', true);
    const surface = document.createElement('div');
    inner.appendChild(surface);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    expect(findScrollContainer(surface)).toBe(inner);
    outer.remove();
  });
});
