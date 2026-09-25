/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's undo stack, wired to the DOM node.
 *
 * `history.ts` is the pure bookkeeping (push, merge, step, cap); this is the
 * part that has to touch the `<textarea>`: committing an edit as one entry,
 * restoring a stepped record, and re-seeding the stack when the value is
 * replaced from the OUTSIDE.
 *
 * The re-seed is the subtle one. It exists for a file switch or a refresh, but
 * a naive `[value]` effect also fires for the component's own edits — every
 * keystroke then pushed a second, identical entry, so the first ⌘Z restored the
 * buffer to the state it was already in and undo looked broken until the second
 * press (and the no-op `onValueChange` truncated the redo stack). The `applied`
 * ref is what distinguishes "someone else replaced the value" from "we did".
 */

import { useEffect, useRef } from 'preact/hooks';

import { createHistory, pushEdit, pushRecord, stepHistory, type History, type HistoryRecord } from '@/shared/lib/code/editor/history';

/** The fields every write path needs: a buffer and where the caret goes. */
export type HistoryEdit = Pick<HistoryRecord, 'value' | 'selectionStart' | 'selectionEnd'>;

export interface EditorHistory {
  /** The stack itself, for the typing-burst merge in the change handler. */
  history: History;
  /**
   * The buffer as this component last knew it — its own writes included, and
   * never a render behind. Diffing a browser edit has to start from here: the
   * `value` prop lags a keystroke, and a stale `before` reads a one-character
   * edit as a whole-word replacement.
   */
  readonly buffer: string;
  /** Commit an edit as ONE undoable entry. */
  commit: (edit: HistoryEdit) => void;
  /**
   * Commit an edit that SUPERSEDES the entry on top, keeping that entry's
   * caret so undo returns to the selection the edit replaced.
   */
  commitEdit: (edit: HistoryEdit) => void;
  /** Step the stack and restore the record; no-op at either end. */
  step: (direction: 'undo' | 'redo') => void;
  /**
   * Declare a value the BROWSER produced as already applied, so the re-seed
   * effect below does not record it a second time. The change handler calls
   * this for every keystroke and every replicated multi-cursor edit.
   */
  markApplied: (value: string) => void;
}

export interface UseEditorHistoryOptions {
  /** The controlled buffer, used to detect an external replacement. */
  value: string;
  /** The live `<textarea>`, so an external replacement records its own caret. */
  inputRef: { current: HTMLTextAreaElement | null };
  /** Push the committed buffer to the caller. */
  onValueChange: (value: string) => void;
}

export function useEditorHistory({ value, inputRef, onValueChange }: UseEditorHistoryOptions): EditorHistory {
  const historyRef = useRef<History>(createHistory());
  /** The value this component itself last wrote — see the module note. */
  const appliedRef = useRef<string | null>(null);

  // Re-record when the controlled value is replaced from the outside
  // (file switch, refresh) so undo does not jump between documents.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || appliedRef.current === value) return;
    appliedRef.current = value;
    pushRecord(historyRef.current, {
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      timestamp: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Put a buffer on screen without touching the stack. */
  const write = (edit: HistoryEdit) => {
    appliedRef.current = edit.value;
    onValueChange(edit.value);
    const input = inputRef.current;
    if (!input) return;
    input.value = edit.value;
    input.selectionStart = edit.selectionStart;
    input.selectionEnd = edit.selectionEnd;
  };

  return {
    history: historyRef.current,

    get buffer() {
      return appliedRef.current ?? value;
    },

    commit: (edit) => {
      pushEdit(historyRef.current, { ...edit, timestamp: Date.now() });
      write(edit);
    },

    commitEdit: (edit) => {
      const history = historyRef.current;
      const last = history.stack[history.offset];
      const input = inputRef.current;
      if (last && input) {
        // The entry on top is about to be superseded: keep where its caret was,
        // so undo returns to the selection this edit replaced.
        history.stack[history.offset] = {
          ...last,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
        };
      }
      pushEdit(history, { ...edit, timestamp: Date.now() });
      write(edit);
    },

    step: (direction) => {
      const record = stepHistory(historyRef.current, direction);
      if (record) write(record);
    },

    markApplied: (next) => {
      appliedRef.current = next;
    },
  };
}
