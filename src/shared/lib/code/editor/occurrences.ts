/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The multi-selection rules: what ⌘D, ⌘⇧L and ⌘⇧D do to a buffer, and how one
 * browser edit is replayed at every range.
 *
 * Pure on purpose. The hook that owns the ranges is a ref and a notify call;
 * every decision about WHERE a range goes and what the buffer becomes lives
 * here, so it is testable without a DOM and cannot drift between the keyboard
 * path and the palette path (both call the same functions).
 *
 * The replication rule is the load-bearing one. The browser applies a keystroke
 * at the primary range and reports the whole new buffer; diffing that against
 * the old one recovers "what was typed", and the same replacement is replayed
 * at every other range in one pass. Typing, pasting, deleting and IME
 * composition therefore need no branch per case.
 */

import {
  diffEdit,
  nextOccurrence,
  occurrenceRanges,
  replicateEdit,
  wordRangeAt,
  type TextRange,
} from '@/shared/lib/code/editor/commands';

/** What a selection command did: the primary range plus the extra ones. */
export interface OccurrenceSelection {
  primary: TextRange;
  extras: TextRange[];
}

/**
 * ⌘D. With a bare caret the first press selects the word under it and stops —
 * "select this word" and "and the next one too" are two different asks, and
 * adding a range on the first press would leave the word selected once and its
 * neighbour selected twice. With a selection, the next unselected occurrence is
 * added.
 *
 * Null when there is no word and no selection, or when every occurrence is
 * already selected: the caller then leaves the selection alone rather than
 * cycling silently.
 */
export function growToNextOccurrence(
  text: string,
  primary: TextRange,
  extras: readonly TextRange[],
): OccurrenceSelection | null {
  const hasSelection = primary.end > primary.start;
  const seed = hasSelection ? primary : wordRangeAt(text, primary.start);
  if (!seed) return null;
  const word = text.slice(seed.start, seed.end);
  if (!word) return null;

  if (!hasSelection) return { primary: seed, extras: [...extras] };

  const next = nextOccurrence(text, word, [primary, ...extras]);
  if (!next) return null;
  return { primary, extras: [...extras, next] };
}

/**
 * ⌘⇧L. Every occurrence becomes a range: the first is the primary (the textarea
 * can only hold one selection) and the rest are extras. Null when there is
 * nothing to select.
 */
export function selectAllOccurrences(text: string, primary: TextRange): OccurrenceSelection | null {
  const seed = primary.end > primary.start ? primary : wordRangeAt(text, primary.start);
  if (!seed) return null;
  const word = text.slice(seed.start, seed.end);
  if (!word) return null;
  const [first, ...rest] = occurrenceRanges(text, word);
  if (!first) return null;
  return { primary: first, extras: rest };
}

/**
 * ⌘⇧D. The offset directly below `offset`, keeping the column — and clamped to
 * that line's end, so a caret at the end of a short line lands at the end of the
 * next one rather than on a character it never had. Null on the last line.
 */
export function offsetBelow(text: string, offset: number): number | null {
  const lineEnd = text.indexOf('\n', offset);
  if (lineEnd === -1) return null;
  const column = offset - (text.lastIndexOf('\n', offset - 1) + 1);
  const nextLineStart = lineEnd + 1;
  const nextLineEnd = text.indexOf('\n', nextLineStart);
  return Math.min(nextLineStart + column, nextLineEnd === -1 ? text.length : nextLineEnd);
}

/**
 * Replay the browser's edit (`before` → `after`, applied at `primaryBefore`) at
 * every extra range. Null when there are no extras, which is the caller's cue to
 * keep the ordinary single-selection path.
 */
export function replicateAtRanges(
  before: string,
  after: string,
  primaryBefore: TextRange,
  extras: readonly TextRange[],
): { value: string; caret: number; rest: TextRange[] } | null {
  if (extras.length === 0) return null;
  const diff = diffEdit(before, after, primaryBefore);
  const applied = replicateEdit(before, [{ start: diff.start, end: diff.end }, ...extras], diff.inserted);
  const [caret, ...rest] = applied.carets;
  return { value: applied.value, caret, rest: rest.map((offset) => ({ start: offset, end: offset })) };
}
