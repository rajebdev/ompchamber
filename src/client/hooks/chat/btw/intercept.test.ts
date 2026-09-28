/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `/btw` interception.
 *
 * The token must be recognized the way omp parses a slash invocation — on the
 * earliest whitespace OR `:` — because a form the chamber does not intercept is
 * sent to the model as literal text (omp's `/btw` is TUI-only, so nothing
 * downstream understands it).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchBtwCommand } from '@/client/hooks/chat/btw/intercept';

/**
 * `bun test` runs without a DOM; the interceptor only needs an event target.
 *
 * The stub is installed for this file alone and REMOVED afterwards: several
 * other files in this suite install their own DOM by assigning `globalThis`,
 * and a `window` left behind here replaced theirs (measured: `use-file-editor`
 * failed with `form.get is not a function`). The descriptor is `writable` for
 * the same reason — those files assign rather than define.
 */
const hadWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true, writable: true });
});

afterAll(() => {
  if (hadWindow) Object.defineProperty(globalThis, 'window', hadWindow);
  else delete (globalThis as Record<string, unknown>).window;
});

function capture(text: string): { handled: boolean; detail: unknown } {
  let detail: unknown;
  const listener = (event: Event) => {
    detail = (event as CustomEvent).detail;
  };
  window.addEventListener('omp:btw', listener);
  try {
    const handled = dispatchBtwCommand(text, []);
    return { handled, detail };
  } finally {
    window.removeEventListener('omp:btw', listener);
  }
}

describe('dispatchBtwCommand', () => {
  test('a bare command opens the panel with no question', () => {
    const { handled, detail } = capture('/btw');
    expect(handled).toBe(true);
    expect(detail).toEqual({ question: '' });
  });

  test('a whitespace-separated question is carried', () => {
    const { handled, detail } = capture('/btw what is this?');
    expect(handled).toBe(true);
    expect(detail).toEqual({ question: 'what is this?' });
  });

  test('a colon-separated question is the same invocation', () => {
    const { handled, detail } = capture('/btw:what is this?');
    expect(handled).toBe(true);
    expect(detail).toEqual({ question: 'what is this?' });
  });

  test('case does not matter', () => {
    expect(capture('/BTW hi').handled).toBe(true);
  });

  test('anything else is left for the normal send path', () => {
    expect(capture('hello /btw').handled).toBe(false);
    expect(capture('/btwx').handled).toBe(false);
    expect(capture('').handled).toBe(false);
  });
});
