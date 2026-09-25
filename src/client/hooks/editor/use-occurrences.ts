/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The hook that owns the editor's extra selection ranges.
 *
 * It is a thin shell over `shared/lib/code/editor/occurrences`: the rules live
 * there as pure functions, and this holds the ranges in a ref (the keydown and
 * `input` handlers read them synchronously, inside one event) and tells the
 * caller through `onChange` so the surface can paint them.
 *
 * The split is deliberate: a hook that decides where a range goes cannot be
 * tested without a DOM, and every rule here is one a user notices when it is
 * wrong.
 */

import { useRef } from 'preact/hooks';

import {
  growToNextOccurrence,
  offsetBelow,
  replicateAtRanges,
  selectAllOccurrences,
} from '@/shared/lib/code/editor/occurrences';
import type { TextRange } from '@/shared/lib/code/editor/commands';

export interface UseOccurrencesOptions {
  /** Called with the extra ranges whenever they change, so the surface repaints. */
  onChange: (ranges: readonly TextRange[]) => void;
  /** The caller's copy of the ranges — clearing them there must clear them here. */
  controlled?: readonly TextRange[];
}

export interface OccurrencesApi {
  /** The extra ranges, excluding the textarea's own (primary) selection. */
  readonly ranges: readonly TextRange[];
  /** Replace the ranges and notify the surface. */
  set: (ranges: readonly TextRange[]) => void;
  /** Drop every extra range. */
  clear: () => void;
  /** ⌘D — grow the primary selection to the next occurrence of what it covers. */
  selectNext: (input: HTMLTextAreaElement, select: (start: number, end: number) => void) => void;
  /** ⌘⇧L — select every occurrence of the selection/word at the caret. */
  selectAll: (input: HTMLTextAreaElement, select: (start: number, end: number) => void) => void;
  /** ⌘⇧D — add an empty caret on the line below. */
  insertCursorBelow: (input: HTMLTextAreaElement) => void;
  /**
   * Replay the browser's edit at every extra range. Returns the buffer and
   * caret the caller should commit, or null when there is nothing to replicate.
   */
  replicate: (before: string, after: string, primaryBefore: TextRange) => { value: string; caret: number; rest: TextRange[] } | null;
}

export function useOccurrences({ onChange, controlled }: UseOccurrencesOptions): OccurrencesApi {
  const ref = useRef<readonly TextRange[]>([]);
  // The caller may clear the ranges without the editor asking (a file switch, a
  // save), so its copy is mirrored into the ref the handlers read.
  if (controlled && controlled !== ref.current) ref.current = controlled;

  const set = (ranges: readonly TextRange[]) => {
    ref.current = ranges;
    onChange(ranges);
  };

  return {
    get ranges() {
      return ref.current;
    },
    set,
    clear: () => set([]),

    selectNext: (input, select) => {
      const current: TextRange = { start: input.selectionStart, end: input.selectionEnd };
      const next = growToNextOccurrence(input.value, current, ref.current);
      if (!next) return;
      select(next.primary.start, next.primary.end);
      set(next.extras);
    },

    selectAll: (input, select) => {
      const current: TextRange = { start: input.selectionStart, end: input.selectionEnd };
      const all = selectAllOccurrences(input.value, current);
      if (!all) return;
      select(all.primary.start, all.primary.end);
      set(all.extras);
    },

    insertCursorBelow: (input) => {
      const target = offsetBelow(input.value, input.selectionStart);
      if (target === null) return;
      set([...ref.current, { start: target, end: target }]);
    },

    replicate: (before, after, primaryBefore) => replicateAtRanges(before, after, primaryBefore, ref.current),
  };
}
