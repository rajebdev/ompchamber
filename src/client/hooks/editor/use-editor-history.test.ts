/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's undo stack.
 *
 * The rule under test is the one that was wrong: the re-seed exists for a value
 * replaced from the OUTSIDE (a file switch, a refresh), but it also fired for
 * the component's own edits — every keystroke pushed a second, identical entry,
 * so the first ⌘Z restored the buffer to the state it was already in and undo
 * looked broken until the second press. `markApplied` is what separates the two,
 * and these assertions are what keeps it separating them.
 *
 * Runs against a real DOM (happy-dom) because it is a Preact hook holding a
 * `<textarea>`; the modules below are imported dynamically, after those globals
 * exist (Preact binds its environment at evaluation time).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { h as PreactH, render as PreactRender } from 'preact';
import type { act as PreactAct } from 'preact/test-utils';
import type { EditorHistory, useEditorHistory as UseEditorHistoryHook } from '@/client/hooks/editor/use-editor-history';

let useEditorHistory: typeof UseEditorHistoryHook;
let h: typeof PreactH;
let render: typeof PreactRender;
let act: typeof PreactAct;

let api: EditorHistory | null = null;
let container: HTMLElement;
let textarea: HTMLTextAreaElement;

/** The buffer the hook is told is on screen, changed from the outside by a test. */
let externalValue = 'one';

function Harness() {
  api = useEditorHistory({
    value: externalValue,
    inputRef: { current: textarea },
    onValueChange: (next) => {
      textarea.value = next;
    },
  });
  return null;
}

/** Flush the effect that watches `value`, with no timers: it resolves on a render. */
async function flush() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      for (let turn = 0; turn < 4; turn++) await Promise.resolve();
    });
  }
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
  ({ useEditorHistory } = await import('@/client/hooks/editor/use-editor-history'));
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
  externalValue = 'one';
  container = document.createElement('div');
  document.body.appendChild(container);
  textarea = document.createElement('textarea');
  textarea.value = 'one';
  container.appendChild(textarea);
  await act(async () => {
    render(h(Harness, {}), container);
  });
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('useEditorHistory', () => {
  test('commit writes the buffer, the caret and the caller’s state', async () => {
    await act(async () => {
      api?.commit({ value: 'two', selectionStart: 2, selectionEnd: 2 });
    });

    expect(textarea.value).toBe('two');
    expect(textarea.selectionStart).toBe(2);
  });

  test('an external value replacement is recorded, so undo reaches the old file', async () => {
    // A file switch: the hook did not write this, so it becomes a history entry
    // rather than silently replacing the stack.
    externalValue = 'switched';
    await act(async () => {
      render(h(Harness, {}), container);
    });
    await flush();

    await act(async () => {
      api?.step('undo');
    });

    expect(textarea.value).toBe('one');
  });

  test('a value the hook itself wrote is NOT re-recorded', async () => {
    // The bug this guards: an extra entry per keystroke made the first ⌘Z a
    // no-op, because it restored the buffer to what was already on screen.
    await act(async () => {
      api?.commit({ value: 'two', selectionStart: 2, selectionEnd: 2 });
    });
    externalValue = 'two';
    await act(async () => {
      render(h(Harness, {}), container);
    });
    await flush();

    await act(async () => {
      api?.step('undo');
    });

    // One press reaches the ORIGINAL buffer; a duplicate entry would have
    // restored 'two' again.
    expect(textarea.value).toBe('one');
  });

  test('markApplied declares a browser edit as already recorded', async () => {
    await act(async () => {
      api?.markApplied('typed');
    });
    externalValue = 'typed';
    await act(async () => {
      render(h(Harness, {}), container);
    });
    await flush();

    await act(async () => {
      api?.step('undo');
    });

    // Nothing was pushed for `typed`, so there is nothing to step back to: the
    // stack still holds only the initial record.
    expect(textarea.value).toBe('one');
  });

  test('step at the ends of the stack is a no-op', async () => {
    await act(async () => {
      api?.step('undo');
    });
    const afterUndo = textarea.value;
    await act(async () => {
      api?.step('redo');
    });

    expect(afterUndo).toBe('one');
    expect(textarea.value).toBe('one');
  });

  test('commitEdit supersedes the top entry, keeping its caret for the undo', async () => {
    // A line command replaces a whole range at once; undo must return the caret
    // to the selection the command replaced, not to where the edit ended.
    textarea.selectionStart = 1;
    textarea.selectionEnd = 3;
    await act(async () => {
      api?.commitEdit({ value: 'one-changed', selectionStart: 11, selectionEnd: 11 });
    });
    await act(async () => {
      api?.step('undo');
    });

    expect(textarea.value).toBe('one');
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(3);
  });

  test('the exposed buffer is never a render behind', async () => {
    // `handleChange` diffs against this; a value that lagged a keystroke read a
    // one-character edit as a whole-word replacement.
    await act(async () => {
      api?.commit({ value: 'fresh', selectionStart: 5, selectionEnd: 5 });
    });

    expect(api?.buffer).toBe('fresh');
  });
});
