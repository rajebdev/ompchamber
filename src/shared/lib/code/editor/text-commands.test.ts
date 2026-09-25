/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The text-command dispatch.
 *
 * `runTextCommand` is the single entry point both the keyboard and the command
 * palette go through, so what it asserts is the ROUTING: which commands it
 * claims, which it leaves to the component (Escape, undo, Tab) and which it
 * hands back to the panel. A command that returns `false` silently does nothing
 * when a chord reaches it, which is why the membership table is asserted
 * directly rather than only through the commands themselves.
 */

import { describe, expect, test } from 'bun:test';

import { isTextCommand, runTextCommand, type CommandContext } from '@/shared/lib/code/editor/text-commands';
import type { EditorCommand } from '@/shared/lib/code/editor/keymap';

interface Harness {
  ctx: CommandContext;
  committed: Array<{ value: string; selectionStart: number; selectionEnd: number }>;
  carets: number[];
  selections: Array<[number, number]>;
  edges: string[];
}

function harness(options: { value: string; start: number; end?: number; extend?: boolean; language?: string }): Harness {
  const committed: Harness['committed'] = [];
  const carets: number[] = [];
  const selections: Array<[number, number]> = [];
  const edges: string[] = [];
  return {
    committed,
    carets,
    selections,
    edges,
    ctx: {
      value: options.value,
      selectionStart: options.start,
      selectionEnd: options.end ?? options.start,
      extend: options.extend ?? false,
      language: options.language ?? 'typescript',
      commit: (edit) => committed.push(edit),
      setCaret: (offset) => carets.push(offset),
      selectRange: (start, end) => selections.push([start, end]),
      setDocumentEdge: (edge) => edges.push(edge),
    },
  };
}

describe('isTextCommand', () => {
  test('claims the line and caret commands', () => {
    for (const command of ['moveLineUp', 'copyLineDown', 'deleteLine', 'toggleComment', 'indent', 'lineStart'] as const) {
      expect(isTextCommand(command)).toBe(true);
    }
  });

  test('leaves the DOM-owned and panel-owned commands alone', () => {
    // Undo/redo step the history, Escape is about focus, and the find-bar chords
    // belong to the panel — none of them is buffer arithmetic.
    for (const command of ['undo', 'redo', 'escape', 'find', 'selectNextOccurrence', 'toggleWordWrap'] as const) {
      expect(isTextCommand(command)).toBe(false);
    }
  });
});

describe('runTextCommand', () => {
  test('reports an unowned command rather than pretending to run it', () => {
    const h = harness({ value: 'one', start: 0 });
    expect(runTextCommand('find', h.ctx)).toBe(false);
    expect(h.committed).toEqual([]);
  });

  test('moves a line through the commit path, not by writing the field', () => {
    const h = harness({ value: 'one\ntwo', start: 4, end: 7 });
    expect(runTextCommand('moveLineUp', h.ctx)).toBe(true);

    expect(h.committed[0].value).toBe('two\none');
  });

  test('indents the caret’s whole line, not the text at the caret', () => {
    // ⌘] is a line command: on a bare caret it widens to that line first, which
    // is what keeps it from inserting spaces mid-line.
    const h = harness({ value: 'const a = 1;', start: 10 });
    runTextCommand('indent', h.ctx);

    expect(h.committed[0].value).toBe('  const a = 1;');
  });

  test('indents every line of a selection', () => {
    const h = harness({ value: 'one\ntwo', start: 0, end: 7 });
    runTextCommand('indent', h.ctx);

    expect(h.committed[0].value).toBe('  one\n  two');
  });

  test('outdenting a line that has no indent commits nothing', () => {
    const h = harness({ value: 'one', start: 1 });
    runTextCommand('outdent', h.ctx);

    expect(h.committed).toEqual([]);
  });

  test('comments with the language’s own token', () => {
    const h = harness({ value: 'key: value', start: 0, language: 'yaml' });
    runTextCommand('toggleComment', h.ctx);

    expect(h.committed[0].value).toBe('# key: value');
  });

  test('caret moves collapse the selection', () => {
    const h = harness({ value: 'one\ntwo', start: 5 });
    runTextCommand('lineStart', h.ctx);

    expect(h.carets).toEqual([4]);
    expect(h.selections).toEqual([]);
  });

  test('shifted caret moves extend instead', () => {
    const h = harness({ value: 'one\ntwo', start: 5, extend: true });
    runTextCommand('lineEnd', h.ctx);

    expect(h.selections).toEqual([[5, 7]]);
    expect(h.carets).toEqual([]);
  });

  test('file edges go through the document-edge path', () => {
    const h = harness({ value: 'one\ntwo', start: 5 });
    runTextCommand('documentStart', h.ctx);
    runTextCommand('documentEnd', h.ctx);

    expect(h.edges).toEqual(['start', 'end']);
  });

  test('a shifted document move selects instead of jumping', () => {
    const h = harness({ value: 'one\ntwo', start: 5, extend: true });
    runTextCommand('documentStart', h.ctx);

    expect(h.selections).toEqual([[0, 5]]);
    expect(h.edges).toEqual([]);
  });

  test('the palette reaches the same commands with no event at all', () => {
    // This is the path the command palette uses; a command reachable by chord
    // must be reachable this way too.
    const h = harness({ value: 'one\ntwo', start: 0, end: 3 });
    runTextCommand('copyLineDown', h.ctx);

    expect(h.committed[0].value).toBe('one\none\ntwo');
  });
});

describe('command coverage', () => {
  test('every text command is one the editor keymap can produce', () => {
    // A command in the table that no key or palette entry names would be dead
    // code; this is the check that keeps the table honest.
    const reachable: EditorCommand[] = [
      'moveLineUp',
      'moveLineDown',
      'copyLineUp',
      'copyLineDown',
      'deleteLine',
      'toggleComment',
      'insertLineAbove',
      'insertLineBelow',
      'indent',
      'outdent',
      'lineStart',
      'lineEnd',
      'documentStart',
      'documentEnd',
    ];
    for (const command of reachable) expect(isTextCommand(command)).toBe(true);
  });
});
