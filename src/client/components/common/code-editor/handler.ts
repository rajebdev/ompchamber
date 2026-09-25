/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's keydown handler.
 *
 * This is dispatch, not rendering: it reads the textarea, resolves the event
 * against the keymap, and routes the command to whoever owns it — the undo
 * stack, the multi-selection, the pure text commands, or the panel (the find
 * bar's chords, word wrap). It lives outside the component because the
 * component is at the repository's line ceiling and because this is the one
 * place that must agree with the keymap about what each key means.
 *
 * The rules that are NOT obvious, each of which was a bug in the naive version:
 *
 * - **Escape is not a plain blur.** With extra ⌘D ranges live, its first job is
 *   to drop them; only the next press hands the keyboard back to the page.
 * - **Tab / Backspace / Enter are not keymap entries.** Their behaviour is
 *   about the DOM node (indentation, focus, the Tab-capture toggle) as much as
 *   the buffer, so they are handled before the keymap is consulted.
 * - **A command the editor does not own is not consumed** unless the panel
 *   accepts it, so ⌘F still reaches the panel's capture handler and the
 *   browser's own find bar never opens by accident.
 */

import type { TargetedKeyboardEvent } from 'preact';

import { editForBackspace, editForEnter, editForTab } from '@/shared/lib/code/editor/edits';
import { isTextCommand, runTextCommand, type CommittedEdit } from '@/shared/lib/code/editor/text-commands';
import type { OccurrencesApi } from '@/client/hooks/editor/use-occurrences';
import type { EditorHistory } from '@/client/hooks/editor/use-editor-history';
import { EDITOR_KEY_BINDINGS, isFindBarCommand, type EditorCommand } from '@/shared/lib/code/editor/keymap';
import { resolveBinding } from '@/shared/lib/ui/key-binding';
import { isMacPlatform } from '@/shared/lib/util/platform';

export interface EditorKeydownDeps {
  /** The live `<textarea>`, which owns the buffer and the primary selection. */
  input: HTMLTextAreaElement;
  /** Shiki language id, for the comment syntax. */
  language: string;
  /** Whether Tab is captured (Ctrl+M toggles it). */
  captureTab: boolean;
  toggleCaptureTab: () => void;
  history: EditorHistory;
  multi: OccurrencesApi;
  /** Select `[start, end)` and focus the field. */
  select: (start: number, end: number) => void;
  /** Hand a command the editor does not own to the panel. */
  delegate: (command: EditorCommand) => void;
}

/**
 * Run a command that is already resolved — the routing half of the handler,
 * shared by the keydown path and by callers that have no event at all (the
 * command palette, a toolbar button). Splitting it out is what stops the
 * palette from being a second, partial dispatcher: a command reachable from
 * the keyboard is reachable from the palette by construction.
 */
export function runEditorCommand(command: EditorCommand, deps: EditorKeydownDeps, extend = false): void {
  const { input, history, multi, select } = deps;
  const { value: text, selectionStart, selectionEnd } = input;

  if (command === 'undo' || command === 'redo') {
    multi.clear();
    history.step(command === 'undo' ? 'undo' : 'redo');
    return;
  }
  if (command === 'selectNextOccurrence' || command === 'selectAllOccurrences') {
    if (command === 'selectNextOccurrence') multi.selectNext(input, select);
    else multi.selectAll(input, select);
    return;
  }
  if (command === 'insertCursorBelow') {
    multi.insertCursorBelow(input);
    return;
  }

  if (isTextCommand(command)) {
    runTextCommand(command, {
      value: text,
      selectionStart,
      selectionEnd,
      extend,
      language: deps.language,
      commit: (edit: CommittedEdit) => {
        // A line command replaces the whole selection model: the extra ranges
        // pointed at text that has just moved, and keeping them would leave
        // carets on the wrong lines.
        multi.clear();
        history.commitEdit(edit);
      },
      setCaret: (offset) => select(offset, offset),
      selectRange: (start, end) => select(start, end),
      setDocumentEdge: (edge) => {
        const offset = edge === 'start' ? 0 : text.length;
        select(offset, offset);
      },
    });
    return;
  }

  deps.delegate(command);
}

/** Run the keydown handler. Every branch returns, so exactly one action fires. */
export function handleEditorKeydown(e: TargetedKeyboardEvent<HTMLTextAreaElement>, deps: EditorKeydownDeps): void {
  const { input, history, multi } = deps;
  const { value: text, selectionStart, selectionEnd } = input;
  const isMac = isMacPlatform();

  if (e.key === 'Escape') {
    if (multi.ranges.length > 0) {
      e.preventDefault();
      multi.clear();
      return;
    }
    input.blur();
    return;
  }

  // The bare-key handling below runs only for an UNMODIFIED key: ⌘⏎ and ⌘[
  // are chords in the keymap, and catching them here first is what made the
  // insert-line and indent commands unreachable (the plain-Enter branch
  // swallowed them and did nothing, because the line had no indentation).
  const unmodified = !e.metaKey && !e.ctrlKey && !e.altKey;

  if (e.key === 'Tab' && deps.captureTab && unmodified) {
    e.preventDefault();
    // ⇧Tab with nothing selected is not an unindent — `editForTab` returns the
    // buffer unchanged, and the key is consumed so focus cannot escape the
    // editor mid-line.
    const edit = editForTab(text, selectionStart, selectionEnd, e.shiftKey);
    if (edit.value !== text) history.commitEdit(edit);
    return;
  }
  if (e.key === 'Backspace' && unmodified) {
    const edit = editForBackspace(text, selectionStart, selectionEnd);
    if (edit) {
      e.preventDefault();
      history.commitEdit(edit);
    }
    return;
  }
  if (e.key === 'Enter' && unmodified) {
    const edit = editForEnter(text, selectionStart, selectionEnd);
    if (edit) {
      e.preventDefault();
      history.commitEdit(edit);
    }
    return;
  }

  const command = resolveBinding(EDITOR_KEY_BINDINGS, e);
  if (!command) {
    // Ctrl+M / Ctrl+Shift+M toggles Tab capture so keyboard users can leave.
    if (e.ctrlKey && e.key.toLowerCase() === 'm' && (isMac ? e.shiftKey : true)) {
      e.preventDefault();
      deps.toggleCaptureTab();
    }
    return;
  }

  // The editor owns everything except the panel's own commands, which the
  // delegate reports on. A find-bar chord is consumed either way, so the
  // browser's find bar never opens over the editor.
  e.preventDefault();
  if (isFindBarCommand(command)) {
    deps.delegate(command);
    return;
  }
  runEditorCommand(command, deps, e.shiftKey);

}
