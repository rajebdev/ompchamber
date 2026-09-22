/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Undo history for the code editor.
 *
 * The editor cannot lean on the browser's own undo: it renders a transparent
 * `<textarea>` over a highlighted `<pre>`, so a native undo would desync the two
 * layers. Every entry therefore stores the whole buffer plus the caret, and this
 * module is the bookkeeping behind ⌘Z / ⇧⌘Z — push, merge a typing burst into
 * the word being typed, cap the stack, and step through it.
 */

export interface HistoryRecord {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  timestamp: number;
}

export interface History {
  stack: HistoryRecord[];
  offset: number;
}

const HISTORY_LIMIT = 100;
/** Typing within this window of the previous edit merges into that entry. */
export const HISTORY_TIME_GAP = 3000;
/** The word the caret sits at the end of, which is what a burst keeps extending. */
const WORD_TAIL = /[^a-z0-9]([a-z0-9]+)$/i;

export function createHistory(): History {
  return { stack: [], offset: -1 };
}

/** Append `record`, dropping the redo entries that follow the current position. */
export function pushRecord(history: History, record: HistoryRecord): void {
  if (history.stack.length && history.offset > -1) {
    history.stack = history.stack.slice(0, history.offset + 1);
  }
  history.stack.push(record);
  history.offset = history.stack.length - 1;
}

/** Push an edit and cap the stack, leaving `offset` on the same entry. */
export function pushEdit(history: History, record: HistoryRecord): void {
  pushRecord(history, record);
  if (history.stack.length <= HISTORY_LIMIT) return;
  const extras = history.stack.length - HISTORY_LIMIT;
  history.stack = history.stack.slice(extras);
  history.offset = Math.max(history.offset - extras, 0);
}

/** The tail word of the line `position` sits on. */
function tailWord(value: string, position: number): string | undefined {
  return value.substring(0, position).split('\n').pop()?.match(WORD_TAIL)?.[1];
}

/**
 * Whether a change keeps typing the word the previous entry ended with — the
 * test that folds a run of keystrokes into one undoable edit.
 */
export function continuesTyping(
  last: HistoryRecord | undefined,
  next: string,
  selectionStart: number,
  timestamp: number,
): boolean {
  if (!last || timestamp - last.timestamp >= HISTORY_TIME_GAP) return false;
  const previous = tailWord(last.value, last.selectionStart);
  const current = tailWord(next, selectionStart);
  return Boolean(previous && current?.startsWith(previous));
}

/** Fold a continuation into the current entry, which stays the current position. */
export function mergeTyping(
  history: History,
  next: string,
  selectionStart: number,
  selectionEnd: number,
  timestamp: number,
): void {
  // A merge is an edit like any other, so it drops the redo entries after it —
  // otherwise typing straight after an undo would leave a stale redo target.
  history.stack = history.stack.slice(0, history.offset + 1);
  history.stack[history.offset] = { value: next, selectionStart, selectionEnd, timestamp };
}

/**
 * Step one entry back (undo) or forward (redo) and return the buffer to
 * restore, or null at either end of the stack.
 */
export function stepHistory(history: History, direction: 'undo' | 'redo'): HistoryRecord | null {
  const index = direction === 'undo' ? history.offset - 1 : history.offset + 1;
  const record = history.stack[index];
  if (!record) return null;
  history.offset = direction === 'undo' ? Math.max(index, 0) : Math.min(index, history.stack.length - 1);
  return record;
}
