/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's find/replace state machine.
 *
 * Owns the query, the option toggles, which match is "current", and the two
 * write paths (replace one, replace all). Every rule it applies lives in
 * `shared/lib/code/editor/find`, so the count in the widget, the marks painted
 * on the surface and the bytes written back are the same list — the failure
 * this shape exists to prevent is a widget that says "3 of 7" over highlights
 * that disagree.
 *
 * The query and the toggles persist per session; whether the bar is OPEN does
 * not. A reload that reopened a find bar over the file would be noise the user
 * never asked for, and the same reasoning keeps the btw panel unpersisted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { useSessionState } from '@/client/hooks/workspace/session-state';
import {
  DEFAULT_FIND_OPTIONS,
  findMatches,
  matchIndexAtOrAfter,
  replaceAllMatches,
  replaceMatch,
  stepMatchIndex,
  type FindOptions,
} from '@/shared/lib/code/editor/find';
import type { EditorCommand } from '@/shared/lib/code/editor/keymap';

export interface UseEditorFindOptions {
  /** The buffer on screen. */
  text: string;
  /** Identity of the open document — a switch re-seeds the current match. */
  documentKey: string;
  /** Current selection, used to seed the query the way VS Code does. */
  readSelection: () => { start: number; end: number } | null;
  select: (start: number, end: number, focus?: boolean) => void;
  reveal: (offset: number) => void;
  /** Replace the buffer as ONE undoable edit; focus stays where the caller wants it. */
  applyDocument: (value: string, caretStart: number, caretEnd: number) => void;
  /** ⌥Z / Alt+Z — word wrap belongs to the editor panel, not to this hook. */
  toggleWordWrap?: () => void;
}

export interface EditorFindState {
  open: boolean;
  replaceOpen: boolean;
  query: string;
  replacement: string;
  options: FindOptions;
  matches: readonly { start: number; end: number }[];
  /** The document holds more matches than the cap. */
  truncated: boolean;
  /** The query does not compile as a regex — a different answer from "no matches". */
  invalid: boolean;
  currentIndex: number;
  setQuery: (value: string) => void;
  setReplacement: (value: string) => void;
  openFind: () => void;
  openReplace: () => void;
  /** Expand/collapse the replace row without changing which match is current. */
  toggleReplace: () => void;
  /** Bumped on every "open find" so the widget can refocus its field. */
  focusRequest: number;
  close: () => void;
  /** Dispatch a keymap command (⌘F, F3, ⌥⌘C, …). */
  runCommand: (command: EditorCommand) => void;
  toggleOption: (key: keyof FindOptions) => void;
  step: (direction: 1 | -1) => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
}

/** A seeded query must be one line of real text, like VS Code's. */
function seedQuery(text: string, selection: { start: number; end: number } | null): string | null {
  if (!selection || selection.start === selection.end) return null;
  const selected = text.slice(selection.start, selection.end);
  if (!selected || selected.includes('\n') || selected.length > 200) return null;
  return selected;
}

export function useEditorFind({
  text,
  documentKey,
  readSelection,
  select,
  reveal,
  applyDocument,
  toggleWordWrap,
}: UseEditorFindOptions): EditorFindState {
  const [query, setQueryState] = useSessionState<string>('editor.findQuery', '');
  const [replacement, setReplacement] = useSessionState<string>('editor.findReplace', '');
  const [storedOptions, setOptions] = useSessionState<FindOptions>('editor.findOptions', DEFAULT_FIND_OPTIONS);
  // A blob written before an option existed carries only the keys it had, so
  // the read is merged over the defaults rather than trusted wholesale.
  const options = useMemo<FindOptions>(() => ({ ...DEFAULT_FIND_OPTIONS, ...storedOptions }), [storedOptions]);
  const [open, setOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  /** Bumped by every open request so the widget can refocus its field. */
  const [focusRequest, setFocusRequest] = useState(0);
  /**
   * Bumped whenever the current match must be re-resolved even though the match
   * LIST has not changed — opening the bar on an unchanged query, or switching
   * documents (where the offsets mean something else entirely). Without it the
   * resolve effect never ran and the bar kept pointing at the previous file's
   * index.
   */
  const [resolveRequest, setResolveRequest] = useState(0);
  /** Read outside the callbacks: "already open" must not re-seed the query. */
  const openRef = useRef(false);
  openRef.current = open;

  const result = useMemo(() => findMatches(text, query, options), [text, query, options]);

  /**
   * Where the current match is resolved FROM: the caret/anchor a reseed uses.
   * A step and a replacement both move it, which is what keeps "next match"
   * meaning the one after the one just replaced.
   */
  const anchorRef = useRef(0);
  /** The next match-list change re-resolves the current match from the anchor. */
  const reseedRef = useRef(true);

  // Live mirrors: `reveal`/`select` close over the surface's own layout state,
  // and the effects below must not re-run because a callback identity moved.
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const selectRef = useRef(select);
  selectRef.current = select;

  const reseed = useCallback((anchor: number) => {
    anchorRef.current = anchor;
    reseedRef.current = true;
  }, []);

  // A new document starts from the top: the offsets of the previous file's
  // match say nothing about this one. The token is what makes the resolve below
  // run when the match list itself is unchanged.
  useEffect(() => {
    reseed(0);
    setResolveRequest((previous) => previous + 1);
  }, [documentKey, reseed]);

  // Resolve the current match whenever the match list moves under it — a
  // keystroke in the query, a toggle, an edit, a replacement. Only a reseed
  // scrolls: an edit in the document must not yank the view back to a match
  // the user is no longer looking at.
  useEffect(() => {
    const matches = result.matches;
    if (reseedRef.current) {
      reseedRef.current = false;
      const index = matchIndexAtOrAfter(matches, anchorRef.current);
      setCurrentIndex(index);
      if (index >= 0) {
        selectRef.current(matches[index].start, matches[index].end, false);
        revealRef.current(matches[index].start);
      }
      return;
    }
    setCurrentIndex((previous) => {
      if (matches.length === 0) return -1;
      if (previous < 0) return matchIndexAtOrAfter(matches, anchorRef.current);
      return Math.min(previous, matches.length - 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resolveRequest]);

  const setQuery = useCallback(
    (value: string) => {
      setQueryState(value);
      // Typing in the field is an explicit re-aim: the first match at or after
      // the caret the widget opened on is the one the user means.
      reseed(anchorRef.current);
    },
    [setQueryState, reseed],
  );

  const openFind = useCallback(() => {
    setFocusRequest((previous) => previous + 1);
    // Already open: ⌘F is a request for the field, not a new search. Re-seeding
    // here would overwrite what the user typed with the current match's text,
    // since the widget keeps that match selected in the document.
    if (openRef.current) return;
    const selection = readSelection();
    const seeded = seedQuery(text, selection);
    if (seeded) setQueryState(seeded);
    reseed(selection ? selection.start : 0);
    setOpen(true);
    // The replace row is NOT collapsed here: ⌥⌘F opens the bar with it already
    // showing, and this function is the path it takes.
    setResolveRequest((previous) => previous + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, readSelection, reseed, setQueryState]);

  const openReplace = useCallback(() => {
    setReplaceOpen(true);
    openFind();
  }, [openFind]);

  const toggleReplace = useCallback(() => setReplaceOpen((prev) => !prev), []);

  const close = useCallback(() => {
    setOpen(false);
    setReplaceOpen(false);
    // Focus returns to the match, which is where the user was looking.
    const match = result.matches[currentIndex];
    if (match) select(match.start, match.end, true);
  }, [result.matches, currentIndex, select]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const matches = result.matches;
      if (matches.length === 0) return;
      const index = stepMatchIndex(currentIndex, matches.length, direction);
      setCurrentIndex(index);
      anchorRef.current = matches[index].end;
      // Selection is set without stealing focus: the user may be typing in the
      // find field, and the current-match mark is what shows where it landed.
      select(matches[index].start, matches[index].end, false);
      reveal(matches[index].start);
    },
    [result.matches, currentIndex, select, reveal],
  );

  const toggleOption = useCallback(
    (key: keyof FindOptions) => {
      setOptions({ ...options, [key]: !options[key] });
      reseed(anchorRef.current);
    },
    [options, setOptions, reseed],
  );

  const replaceCurrent = useCallback(() => {
    const match = result.matches[currentIndex];
    if (!match) return;
    const next = replaceMatch(text, match, query, replacement, options);
    if (!next) return;
    // Focus stays in the widget: "Replace" is a button the user is about to
    // press again, and pulling focus into the document would eat the next ⌘⌥F.
    applyDocument(next.text, next.caret, next.caret);
    reseed(next.caret);
  }, [result.matches, currentIndex, text, query, replacement, options, applyDocument, reseed]);

  const replaceAll = useCallback(() => {
    const next = replaceAllMatches(text, query, replacement, options);
    if (next === null || next === text) return;
    const caret = Math.min(anchorRef.current, next.length);
    applyDocument(next, caret, caret);
    reseed(caret);
  }, [text, query, replacement, options, applyDocument, reseed]);

  const runCommand = useCallback(
    (command: EditorCommand) => {
      switch (command) {
        case 'find':
          openFind();
          return;
        case 'replace':
          openReplace();
          return;
        case 'nextMatch':
          step(1);
          return;
        case 'previousMatch':
          step(-1);
          return;
        case 'replaceOne':
          replaceCurrent();
          return;
        case 'replaceAll':
          replaceAll();
          return;
        case 'toggleCaseSensitive':
          toggleOption('matchCase');
          return;
        case 'toggleWholeWord':
          toggleOption('wholeWord');
          return;
        case 'toggleRegex':
          toggleOption('isRegex');
          return;
        case 'toggleWordWrap':
          toggleWordWrap?.();
          return;
        default:
          return;
      }
    },
    [openFind, openReplace, step, replaceCurrent, replaceAll, toggleOption, toggleWordWrap],
  );

  return {
    open,
    replaceOpen,
    query,
    replacement,
    options,
    matches: result.matches,
    truncated: result.truncated,
    invalid: result.invalid,
    currentIndex,
    setQuery,
    setReplacement,
    openFind,
    openReplace,
    toggleReplace,
    focusRequest,
    close,
    runCommand,
    toggleOption,
    step,
    replaceCurrent,
    replaceAll,
  };
}
