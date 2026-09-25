/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's text commands, as a dispatch table.
 *
 * Extracted from the component because it is dispatch rather than rendering,
 * and because it keeps the component under the repository's line ceiling. The
 * component still owns the keys whose behaviour is about the DOM node rather
 * than the buffer — Escape, Tab, Backspace, Enter, undo/redo — and calls in
 * here for everything that is pure string arithmetic.
 */

import {
  commentSyntaxFor,
  deleteLines,
  duplicateLines,
  insertLine,
  lineEdges,
  moveLines,
  toggleLineComment,
  type TextRange,
} from '@/shared/lib/code/editor/commands';
import { editForTab } from '@/shared/lib/code/editor/edits';
import { lineRangeAt } from '@/shared/lib/code/editor/lines';
import type { EditorCommand } from '@/shared/lib/code/editor/keymap';

/** A whole-buffer edit plus where the caret lands. */
export interface CommittedEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface CommandContext {
  /** Current buffer and selection, read from the live textarea. */
  value: string;
  selectionStart: number;
  selectionEnd: number;
  /** True while the event carried Shift (⌘↑ with Shift extends instead of moving). */
  extend: boolean;
  /** Shiki language id, which picks the comment syntax. */
  language: string;
  /** Commit a whole-buffer edit as ONE undoable step. */
  commit: (edit: CommittedEdit) => void;
  /** Move the caret, collapsing any selection. */
  setCaret: (offset: number) => void;
  /** Move the caret while keeping the selection's other end anchored. */
  selectRange: (start: number, end: number) => void;
  /** Jump to the buffer's first or last offset. */
  setDocumentEdge: (edge: 'start' | 'end') => void;
}

/**
 * Commands that edit or move within the buffer. Everything else (the find bar's
 * chords, word wrap, save) belongs to the panel and is delegated by the caller.
 */
const TEXT_COMMANDS: Record<string, true> = {
  moveLineUp: true,
  moveLineDown: true,
  copyLineUp: true,
  copyLineDown: true,
  deleteLine: true,
  toggleComment: true,
  insertLineAbove: true,
  insertLineBelow: true,
  indent: true,
  outdent: true,
  lineStart: true,
  lineEnd: true,
  documentStart: true,
  documentEnd: true,
};

export function isTextCommand(command: EditorCommand): boolean {
  return TEXT_COMMANDS[command] === true;
}

/**
 * Run one text command. Returns true when the key was consumed.
 *
 * The buffer-changing branches all commit through `ctx.commit`, which is the
 * component's single write path: one undo entry per command, and the highlight
 * layer follows because the commit goes through the controlled value.
 */
export function runTextCommand(command: EditorCommand, ctx: CommandContext): boolean {
  const selection: TextRange = { start: ctx.selectionStart, end: ctx.selectionEnd };

  switch (command) {
    case 'moveLineUp':
      ctx.commit(moveLines(ctx.value, selection, -1));
      return true;
    case 'moveLineDown':
      ctx.commit(moveLines(ctx.value, selection, 1));
      return true;
    case 'copyLineUp':
      ctx.commit(duplicateLines(ctx.value, selection, -1));
      return true;
    case 'copyLineDown':
      ctx.commit(duplicateLines(ctx.value, selection, 1));
      return true;
    case 'deleteLine':
      ctx.commit(deleteLines(ctx.value, selection));
      return true;
    case 'toggleComment':
      ctx.commit(toggleLineComment(ctx.value, selection, commentSyntaxFor(ctx.language)));
      return true;
    case 'insertLineAbove':
      ctx.commit(insertLine(ctx.value, ctx.selectionStart, 'above'));
      return true;
    case 'insertLineBelow':
      ctx.commit(insertLine(ctx.value, ctx.selectionStart, 'below'));
      return true;

    case 'indent':
    case 'outdent': {
      // ⌘] / ⌘[ act on the LINES the selection touches — on a bare caret that
      // is the caret's own line, which is why the range is widened first. Tab
      // itself still indents at the caret (that is what Tab means in an
      // editor), but a line command that shifted text mid-line would not be
      // indenting anything.
      const range = ctx.selectionStart === ctx.selectionEnd ? lineRangeAt(ctx.value, ctx.selectionStart) : selection;
      const edit = editForTab(ctx.value, range.start, range.end, command === 'outdent');
      if (edit.value !== ctx.value) ctx.commit(edit);
      return true;
    }

    case 'lineStart': {
      const edges = lineEdges(ctx.value, ctx.selectionStart);
      if (ctx.extend) ctx.selectRange(edges.start, ctx.selectionEnd);
      else ctx.setCaret(edges.start);
      return true;
    }
    case 'lineEnd': {
      const edges = lineEdges(ctx.value, ctx.selectionStart);
      if (ctx.extend) ctx.selectRange(ctx.selectionStart, edges.end);
      else ctx.setCaret(edges.end);
      return true;
    }
    case 'documentStart':
      if (ctx.extend) ctx.selectRange(0, ctx.selectionEnd);
      else ctx.setDocumentEdge('start');
      return true;
    case 'documentEnd':
      if (ctx.extend) ctx.selectRange(ctx.selectionStart, ctx.value.length);
      else ctx.setDocumentEdge('end');
      return true;

    default:
      return false;
  }
}
