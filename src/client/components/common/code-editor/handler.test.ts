/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's keydown dispatcher, exercised with a fake textarea.
 *
 * These assertions are the routing contract: which layer owns a key, and what
 * happens to the event when nobody does. The failures they guard against are
 * all silent — a chord that reaches the browser's own find bar, an Escape that
 * throws away a multi-selection instead of dropping it, a Tab that escapes the
 * editor mid-line.
 */

import { describe, expect, test } from 'bun:test';

import { handleEditorKeydown, runEditorCommand, type EditorKeydownDeps } from '@/client/components/common/code-editor/handler';
import { createHistory, pushRecord } from '@/shared/lib/code/editor/history';
import type { EditorHistory } from '@/client/hooks/editor/use-editor-history';
import type { OccurrencesApi } from '@/client/hooks/editor/use-occurrences';
import type { EditorCommand } from '@/shared/lib/code/editor/keymap';
import type { TextRange } from '@/shared/lib/code/editor/commands';
import { isMacPlatform } from '@/shared/lib/util/platform';

/** A textarea stand-in: the dispatcher only reads value/selection and calls blur. */
function fakeInput(value: string, start: number, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    blurred: false,
    blur() {
      this.blurred = true;
    },
  };
}

interface Harness {
  deps: EditorKeydownDeps;
  committed: Array<{ value: string; selectionStart: number; selectionEnd: number }>;
  steps: string[];
  delegated: EditorCommand[];
  cleared: number;
  selected: Array<[number, number]>;
  ranges: TextRange[];
  captureToggles: number;
}

function harness(options: { value: string; start?: number; end?: number; ranges?: TextRange[]; language?: string; delegate?: (c: EditorCommand) => boolean } = { value: '' }): Harness {
  const committed: Harness['committed'] = [];
  const steps: string[] = [];
  const delegated: EditorCommand[] = [];
  const selected: Array<[number, number]> = [];
  const state = { ranges: options.ranges ? [...options.ranges] : [] as TextRange[] };
  let cleared = 0;
  let captureToggles = 0;

  const history: EditorHistory = {
    history: createHistory(),
    buffer: options.value,
    commit: (edit) => committed.push(edit),
    commitEdit: (edit) => committed.push(edit),
    step: (direction) => steps.push(direction),
    markApplied: () => {},
  };

  const multi: OccurrencesApi = {
    get ranges() {
      return state.ranges;
    },
    set: (ranges) => {
      state.ranges = [...ranges];
    },
    clear: () => {
      cleared++;
      state.ranges = [];
    },
    selectNext: (input, select) => select(input.selectionStart, input.selectionEnd + 1),
    selectAll: (input, select) => select(0, input.value.length),
    insertCursorBelow: () => {},
    replicate: () => null,
  };

  const input = fakeInput(options.value, options.start ?? 0, options.end ?? options.start ?? 0);
  const deps: EditorKeydownDeps = {
    input: input as unknown as HTMLTextAreaElement,
    language: options.language ?? 'typescript',
    captureTab: true,
    toggleCaptureTab: () => captureToggles++,
    history,
    multi,
    select: (start, end) => selected.push([start, end]),
    delegate: (command) => {
      delegated.push(command);
      options.delegate?.(command);
    },
  };

  return {
    deps,
    committed,
    steps,
    delegated,
    selected,
    get cleared() {
      return cleared;
    },
    get captureToggles() {
      return captureToggles;
    },
    get ranges() {
      return state.ranges;
    },
  } as Harness;
}

/** A keydown event with only the fields the dispatcher reads. */
function press(key: string, code: string, modifiers: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
  const prevented = { value: false };
  const event = {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
    preventDefault: () => {
      prevented.value = true;
    },
  };
  return { event: event as never, prevented };
}

describe('handleEditorKeydown', () => {
  test('Escape drops a live multi-selection before it leaves the editor', () => {
    const first = harness({ value: 'abc', ranges: [{ start: 1, end: 2 }] });
    const one = press('Escape', 'Escape');
    handleEditorKeydown(one.event, first.deps);

    expect(first.cleared).toBe(1);
    expect(one.prevented.value).toBe(true);

    // With no extra ranges left, Escape is a plain blur.
    const input = first.deps.input as unknown as { blurred: boolean };
    const two = press('Escape', 'Escape');
    handleEditorKeydown(two.event, first.deps);

    expect(input.blurred).toBe(true);
    expect(two.prevented.value).toBe(false);
  });

  test('Tab indents through the history, not through a raw write', () => {
    const h = harness({ value: 'one', start: 0 });
    const { event, prevented } = press('Tab', 'Tab');
    handleEditorKeydown(event, h.deps);

    expect(prevented.value).toBe(true);
    expect(h.committed[0].value).toBe('  one');
  });

  test('undo and redo step the history and drop the extra ranges', () => {
    const h = harness({ value: 'abc', ranges: [{ start: 1, end: 2 }] });
    handleEditorKeydown(press('z', 'KeyZ', { metaKey: true }).event, h.deps);

    expect(h.steps).toEqual(['undo']);
    expect(h.cleared).toBe(1);
  });

  test('a line command commits and clears the ranges it just invalidated', () => {
    const h = harness({ value: 'one\ntwo', start: 0, end: 3, ranges: [{ start: 8, end: 9 }] });
    handleEditorKeydown(press('ArrowDown', 'ArrowDown', { altKey: true }).event, h.deps);

    expect(h.committed[0].value).toBe('two\none');
    expect(h.cleared).toBe(1);
  });

  test('⌘D routes to the occurrence grower with the editor’s own select', () => {
    const h = harness({ value: 'alpha', start: 0, end: 5 });
    handleEditorKeydown(press('d', 'KeyD', { metaKey: true }).event, h.deps);

    expect(h.selected).toEqual([[0, 6]]);
  });

  test('a find-bar chord is delegated and consumed', () => {
    // The bar may not be open: nothing handles ⌘F, but the browser's own find
    // bar must not open over the editor either — so the chord is consumed
    // whatever the panel does with it.
    const h = harness({ value: 'abc' });
    const { event, prevented } = press('f', 'KeyF', { metaKey: true });
    handleEditorKeydown(event, h.deps);

    expect(h.delegated).toEqual(['find']);
    expect(prevented.value).toBe(true);
  });

  test('a palette-style call runs a text command with no event at all', () => {
    const h = harness({ value: 'one\ntwo', start: 0, end: 3 });
    runEditorCommand('copyLineDown', h.deps);

    expect(h.committed[0].value).toBe('one\none\ntwo');
  });

  test('an unbound chord is left to the browser', () => {
    const h = harness({ value: 'abc' });
    const { event, prevented } = press('a', 'KeyA', { metaKey: true });
    handleEditorKeydown(event, h.deps);

    expect(h.delegated).toEqual([]);
    expect(prevented.value).toBe(false);
  });

  test('a chord built on Enter reaches the keymap instead of the plain-Enter branch', () => {
    // ⌘⏎ is `insertLineBelow`; the plain-Enter auto-indent branch used to catch
    // it first and do nothing on an unindented line, making the command dead.
    const h = harness({ value: 'const a = 1;\nconst b = 2;', start: 20 });
    handleEditorKeydown(press('Enter', 'Enter', { metaKey: true }).event, h.deps);

    expect(h.committed[0].value).toBe('const a = 1;\nconst b = 2;\n');
  });

  test('plain Enter still auto-indents', () => {
    const h = harness({ value: '  one', start: 5 });
    handleEditorKeydown(press('Enter', 'Enter').event, h.deps);

    expect(h.committed[0].value).toBe('  one\n  ');
  });

  test('⌘[ outdents the line the caret is on, with nothing selected', () => {
    const h = harness({ value: '  one', start: 2 });
    handleEditorKeydown(press('[', 'BracketLeft', { metaKey: true }).event, h.deps);

    expect(h.committed[0].value).toBe('one');
    expect(h.committed[0].selectionStart).toBe(0);
  });

  test('Ctrl+M still toggles Tab capture', () => {
    const h = harness({ value: 'abc' });
    // On macOS the chord needs Shift (Ctrl+M alone is Return in the terminal's
    // own vocabulary), which is what the handler encodes.
    const modifiers = isMacPlatform() ? { ctrlKey: true, shiftKey: true } : { ctrlKey: true };
    handleEditorKeydown(press('m', 'KeyM', modifiers).event, h.deps);

    expect(h.captureToggles).toBe(1);
  });
});

describe('editor keymap ownership', () => {
  test('the editor’s own history is seeded, not the browser’s', () => {
    const history = createHistory();
    pushRecord(history, { value: 'a', selectionStart: 1, selectionEnd: 1, timestamp: 1 });
    expect(history.stack.length).toBe(1);
  });
});
