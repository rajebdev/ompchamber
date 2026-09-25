/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useOccurrences` — the ranges behind ⌘D, ⌘⇧L and ⌘⇧D.
 *
 * The rules live in `shared/lib/code/editor/occurrences` and are tested there;
 * what this file covers is the hook's own contract: the caller's copy wins
 * (clearing the ranges in the panel must clear them here), every change is
 * announced so the surface repaints, and the textarea is read rather than
 * assumed.
 *
 * Runs against a real DOM (happy-dom) because it is a Preact hook; the modules
 * below are imported dynamically, after those globals exist.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { h as PreactH, render as PreactRender } from 'preact';
import type { act as PreactAct } from 'preact/test-utils';
import type { OccurrencesApi, useOccurrences as UseOccurrencesHook } from '@/client/hooks/editor/use-occurrences';
import type { TextRange } from '@/shared/lib/code/editor/commands';

let useOccurrences: typeof UseOccurrencesHook;
let h: typeof PreactH;
let render: typeof PreactRender;
let act: typeof PreactAct;

let api: OccurrencesApi | null = null;
let container: HTMLElement;
let textarea: HTMLTextAreaElement;
/** What the caller passes in as its own copy, changed per test. */
let controlled: TextRange[] | undefined;
const announced: Array<readonly TextRange[]> = [];
const selections: Array<[number, number]> = [];

function Harness() {
  api = useOccurrences({
    controlled,
    onChange: (ranges) => announced.push(ranges),
  });
  return null;
}

async function flush() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      for (let turn = 0; turn < 4; turn++) await Promise.resolve();
    });
  }
}

async function rerender() {
  await act(async () => {
    render(h(Harness, {}), container);
  });
  await flush();
}

function select(start: number, end = start) {
  textarea.selectionStart = start;
  textarea.selectionEnd = end;
}

/**
 * Stands in for the editor's own `select`: it MOVES the textarea's selection and
 * records it. The hook reads the textarea, so a callback that only recorded the
 * range would leave every later press looking at the original caret.
 */
function selectingSurface() {
  return (start: number, end: number) => {
    selections.push([start, end]);
    select(start, end);
  };
}

function domGlobals(win: Window): Record<string, unknown> {
  return {
    window: win,
    document: win.document,
    navigator: win.navigator,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    HTMLTextAreaElement: win.HTMLTextAreaElement,
  };
}

const installed: Record<string, unknown> = {};
const displaced: Record<string, unknown> = {};

beforeAll(async () => {
  const win = new Window({ url: 'http://localhost' });
  for (const [key, value] of Object.entries(domGlobals(win))) {
    displaced[key] = (globalThis as Record<string, unknown>)[key];
    installed[key] = value;
    (globalThis as Record<string, unknown>)[key] = value;
  }
  ({ useOccurrences } = await import('@/client/hooks/editor/use-occurrences'));
  ({ h, render } = await import('preact'));
  ({ act } = await import('preact/test-utils'));
});

afterAll(() => {
  for (const key of Object.keys(installed)) {
    if (displaced[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = displaced[key];
  }
});

beforeEach(async () => {
  api = null;
  controlled = undefined;
  announced.length = 0;
  selections.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  textarea = document.createElement('textarea');
  textarea.value = 'alpha beta alpha gamma alpha';
  container.appendChild(textarea);
  await rerender();
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('useOccurrences', () => {
  test('starts with no extra ranges', () => {
    expect(api?.ranges).toEqual([]);
  });

  test('⌘D selects the word first, then grows one occurrence per press', async () => {
    select(2);
    await act(async () => {
      api?.selectNext(textarea, selectingSurface());
    });
    expect(selections.at(-1)).toEqual([0, 5]);
    expect(api?.ranges).toEqual([]);

    await act(async () => {
      api?.selectNext(textarea, selectingSurface());
    });
    expect(api?.ranges).toEqual([{ start: 11, end: 16 }]);
  });

  test('⌘⇧L takes every occurrence, primary first', async () => {
    select(0, 5);
    await act(async () => {
      api?.selectAll(textarea, selectingSurface());
    });

    expect(selections.at(-1)).toEqual([0, 5]);
    expect(api?.ranges).toEqual([
      { start: 11, end: 16 },
      { start: 23, end: 28 },
    ]);
  });

  test('every change is announced so the surface can repaint', async () => {
    select(0, 5);
    await act(async () => {
      api?.selectAll(textarea, () => {});
    });

    expect(announced.at(-1)?.length).toBe(2);
  });

  test('clear drops every range and says so', async () => {
    select(0, 5);
    await act(async () => {
      api?.selectAll(textarea, () => {});
    });
    await act(async () => {
      api?.clear();
    });

    expect(api?.ranges).toEqual([]);
    expect(announced.at(-1)).toEqual([]);
  });

  test('the caller’s copy is authoritative', async () => {
    // The panel can clear the ranges without the editor asking (a file switch,
    // a save); the hook has to follow, not keep its own stale list.
    controlled = [{ start: 1, end: 3 }];
    await rerender();

    expect(api?.ranges).toEqual([{ start: 1, end: 3 }]);

    controlled = [];
    await rerender();

    expect(api?.ranges).toEqual([]);
  });

  test('⌘⇧D adds a caret below on the same column', async () => {
    textarea.value = 'one\ntwo\nthree';
    select(1);
    await act(async () => {
      api?.insertCursorBelow(textarea);
    });

    expect(api?.ranges).toEqual([{ start: 5, end: 5 }]);
  });

  test('⌘⇧D on the last line adds nothing', async () => {
    textarea.value = 'one\ntwo';
    select(5);
    await act(async () => {
      api?.insertCursorBelow(textarea);
    });

    expect(api?.ranges).toEqual([]);
  });

  test('replicate reports nothing without extra ranges', () => {
    expect(api?.replicate('abc', 'abXc', { start: 2, end: 2 })).toBeNull();
  });

  test('replicate replays the browser’s edit at every extra range', async () => {
    select(0, 5);
    await act(async () => {
      api?.selectAll(textarea, () => {});
    });

    // The browser replaced `alpha` at 0..5 with `Z`; the other two follow.
    const applied = api?.replicate('alpha beta alpha gamma alpha', 'Z beta alpha gamma alpha', { start: 0, end: 5 });

    expect(applied?.value).toBe('Z beta Z gamma Z');
    expect(applied?.caret).toBe(1);
    expect(applied?.rest.length).toBe(2);
  });
});
