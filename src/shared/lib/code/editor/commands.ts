/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's text commands — everything a keybinding does to the buffer that
 * is not typing: line comment toggle, line move/duplicate/delete, insert line,
 * the ⌘D occurrence selection, and the edit replication that makes a
 * multi-selection actually editable.
 *
 * All of it is pure string arithmetic, so the rules are testable without a DOM
 * and the component keeps only the parts that need one (reading the textarea,
 * committing through the undo history).
 *
 * MULTI-SELECTION MODEL: the textarea owns exactly one selection — the
 * "primary" — and every other range lives in `occurrences`. Painting them is
 * the highlight layer's job (they are marked like a find match); editing them
 * works by REPLICATION: the browser performs the user's keystroke at the
 * primary range, the resulting edit is diffed out of the new buffer, and the
 * same replacement is applied to every other range in one pass. That is why a
 * keystroke, a paste and an IME composition all need no special case here.
 */

import { lineRangesInSelection, type TextRange } from '@/shared/lib/code/editor/lines';

export type { TextRange };
export { deleteLines, duplicateLines, insertLine, lineEdges, moveLines } from '@/shared/lib/code/editor/line-edits';

/** One edit the browser made, as the difference between two buffers. */
export interface EditDiff {
  /** Range in the OLD buffer that was replaced. */
  start: number;
  end: number;
  /** Text that took its place (empty for a deletion). */
  inserted: string;
}

/** Cap on occurrences a single command may select — a one-character ⌘⇧L on a big file must not build 100k ranges. */
export const MAX_OCCURRENCES = 2_000;

/**
 * The single edit that turns `before` into `after`, as a common-prefix /
 * common-suffix diff. This is what recovers "what did the user just type" from
 * a textarea `input` event, which reports a whole buffer rather than a keystroke.
 *
 * A prefix/suffix diff is ambiguous on repetitive text: deleting the first `a`
 * of `aab` and deleting the second both yield `ab`, and the plain diff always
 * reports the LAST one. `limit` is the caller's knowledge of where the edit
 * happened — the primary selection before the keystroke — and the reported
 * region is widened to contain it. The result is always a valid diff (applying
 * it reproduces `after`) and never claims the edit happened away from the
 * caret.
 */
export function diffEdit(before: string, after: string, limit?: TextRange): EditDiff {
  const max = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < max && before[prefix] === after[prefix]) prefix++;

  let suffix = 0;
  while (suffix < max - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
    suffix++;
  }

  let start = prefix;
  let end = before.length - suffix;
  if (limit) {
    start = Math.min(start, limit.start);
    end = Math.max(end, limit.end);
  }
  return { start, end, inserted: after.slice(start, after.length - (before.length - end)) };
}

/**
 * Apply `inserted` at every range and return the new buffer with each range
 * collapsed to a caret after its own insertion.
 *
 * Ranges are replaced back-to-front so an earlier replacement cannot move the
 * offsets of a later one, while the carets are accumulated front-to-back —
 * each one sits after every insertion that precedes it in the new buffer.
 */
export function replicateEdit(
  text: string,
  ranges: readonly TextRange[],
  inserted: string,
): { value: string; carets: number[] } {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  let value = text;
  for (let index = ordered.length - 1; index >= 0; index--) {
    const range = ordered[index];
    value = value.slice(0, range.start) + inserted + value.slice(range.end);
  }
  const carets: number[] = new Array(ordered.length);
  let shift = 0;
  for (let index = 0; index < ordered.length; index++) {
    const range = ordered[index];
    const insertedLength = inserted.length - (range.end - range.start);
    carets[index] = range.start + shift + inserted.length;
    shift += insertedLength;
  }
  return { value, carets };
}

/**
 * The word the caret sits on: an identifier-ish run of `[\w$]`, with the
 * caret allowed at either edge (⌘D pressed just after a word selects it).
 * Returns null when the caret is not on a word, which is the caller's cue to do
 * nothing rather than to guess at a line.
 */
export function wordRangeAt(text: string, offset: number): TextRange | null {
  const isWord = (char: string | undefined) => char !== undefined && /[\w$]/.test(char);
  let start = Math.min(offset, text.length);
  let end = start;
  if (!isWord(text[start]) && isWord(text[start - 1])) start--;
  if (!isWord(text[start])) return null;
  end = start;
  while (isWord(text[start - 1])) start--;
  while (isWord(text[end])) end++;
  return { start, end };
}

/** Every occurrence of `query` in `text`, in document order. */
export function occurrenceRanges(text: string, query: string, limit: number = MAX_OCCURRENCES): TextRange[] {
  if (!query) return [];
  const ranges: TextRange[] = [];
  for (let index = text.indexOf(query); index !== -1; index = text.indexOf(query, index + query.length)) {
    ranges.push({ start: index, end: index + query.length });
    if (ranges.length >= limit) break;
  }
  return ranges;
}

/**
 * The next occurrence after the last selected range, wrapping to the first one
 * that is not already selected. Null when the document holds no further
 * occurrence — the caller then leaves the selection alone instead of cycling
 * silently.
 */
export function nextOccurrence(text: string, query: string, selected: readonly TextRange[]): TextRange | null {
  const all = occurrenceRanges(text, query);
  if (all.length === 0) return null;
  const taken = new Set(selected.map((range) => `${range.start}:${range.end}`));
  const after = selected.reduce((max, range) => Math.max(max, range.end), -1);
  const found = all.findIndex((range) => range.start >= after);
  const from = found === -1 ? 0 : found;
  for (let step = 0; step < all.length; step++) {
    const range = all[(from + step) % all.length];
    if (!taken.has(`${range.start}:${range.end}`)) return range;
  }
  return null;
}

/** A line-comment syntax: a prefix per line, or a wrapper for languages that have only block comments. */
export type CommentSyntax = { line: string } | { block: readonly [string, string] };

/**
 * How each language's line comment is written. The default is `//`, which is
 * the right answer for every C-family grammar; the exceptions are the ones a
 * wrong token would visibly break (`#` in YAML would be a syntax error, not a
 * comment). Languages that only have block comments get the wrapper — a `//`
 * inserted into CSS comments out nothing and breaks the rule it was added to.
 */
const COMMENT_SYNTAX: Record<string, CommentSyntax> = {
  python: { line: '#' },
  bash: { line: '#' },
  yaml: { line: '#' },
  toml: { line: '#' },
  ruby: { line: '#' },
  perl: { line: '#' },
  r: { line: '#' },
  makefile: { line: '#' },
  dockerfile: { line: '#' },
  ini: { line: '#' },
  properties: { line: '#' },
  elixir: { line: '#' },
  graphql: { line: '#' },
  nix: { line: '#' },
  sql: { line: '--' },
  lua: { line: '--' },
  haskell: { line: '--' },
  css: { block: ['/*', '*/'] },
  scss: { block: ['/*', '*/'] },
  less: { block: ['/*', '*/'] },
  sass: { block: ['/*', '*/'] },
  stylus: { block: ['/*', '*/'] },
  html: { block: ['<!--', '-->'] },
  xml: { block: ['<!--', '-->'] },
  markdown: { block: ['<!--', '-->'] },
};

export function commentSyntaxFor(language: string): CommentSyntax {
  return COMMENT_SYNTAX[language] ?? { line: '//' };
}

/** The lines a selection touches, as ranges that INCLUDE their newline. */
function selectionLines(text: string, selection: TextRange): TextRange[] {
  return lineRangesInSelection(text, selection);
}

/** Whether every line's content already begins with `token`. */
function allCommented(text: string, lines: readonly TextRange[], token: string): boolean {
  return lines.every((line) => text.slice(line.start, line.end).trimStart().startsWith(token));
}

/**
 * Toggle line comments over every line the selection touches.
 *
 * Adding puts the token at the first non-space character, so indentation
 * survives; removing takes the token and the single space an add would have
 * written, which is what makes the toggle idempotent. For a block-only language
 * the whole selection is wrapped instead, once.
 */
export function toggleLineComment(
  text: string,
  selection: TextRange,
  syntax: CommentSyntax,
): { value: string; selectionStart: number; selectionEnd: number } {
  if ('block' in syntax) {
    const [open, close] = syntax.block;
    const before = text.slice(0, selection.start);
    const body = text.slice(selection.start, selection.end);
    const wrapped = `${open} ${body} ${close}`;
    return {
      value: before + wrapped + text.slice(selection.end),
      selectionStart: selection.start,
      selectionEnd: selection.start + wrapped.length,
    };
  }

  const token = syntax.line;
  const lines = selectionLines(text, selection);
  const remove = allCommented(text, lines, token);
  let value = text;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    const content = text.slice(line.start, line.end);
    const indentLength = content.length - content.trimStart().length;
    const at = line.start + indentLength;
    if (remove) {
      const after = value.slice(at + token.length);
      const withSpace = after.startsWith(' ') ? after.slice(1) : after;
      value = value.slice(0, at) + withSpace;
    } else {
      value = value.slice(0, at) + `${token} ` + value.slice(at);
    }
  }

  // The selection keeps covering the same text: adding shifts both edges by the
  // token (plus its space) per touched line, removing shifts them back.
  const delta = token.length + 1;
  const touched = lines.length;
  const shift = remove ? -delta * touched : delta * touched;
  const startShift = remove ? Math.min(0, shift) : shift;
  return {
    value,
    selectionStart: Math.max(0, selection.start + (remove ? shift : startShift)),
    selectionEnd: Math.max(0, selection.end + shift),
  };
}

