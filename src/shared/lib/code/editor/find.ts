/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lineIndexAt, lineStartOffset, type TextRange } from '@/shared/lib/code/editor/lines';

export { lineIndexAt, lineStartOffset };

/**
 * Find and replace over one document buffer — the pure half of the editor's
 * find widget.
 *
 * Everything here is offset arithmetic on a string: what the query compiles
 * to, which ranges match, where the caret lands after a replacement, and how
 * `$1` is expanded. The widget, the hook that owns its state and the editor
 * surface that paints the matches all read these results, so none of them
 * re-implements a rule and the count in the widget cannot disagree with the
 * ranges on screen.
 */

export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  isRegex: boolean;
}

/** Half-open `[start, end)` offset range in the document. */
export type FindMatch = TextRange;

export interface FindResult {
  matches: FindMatch[];
  /** The document holds more matches than the cap; the list stops at it. */
  truncated: boolean;
  /** A regex query that does not compile — a different answer from "no matches". */
  invalid: boolean;
}

/**
 * Ceiling on collected matches. A one-character query over a large file matches
 * tens of thousands of times and every match costs a Range in the highlight
 * registry, so past this the list stops and the widget reports `N+`.
 */
export const MAX_FIND_MATCHES = 5_000;

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  matchCase: false,
  wholeWord: false,
  isRegex: false,
};

/**
 * The pattern a query compiles to, or null when the query is empty or does not
 * compile. A literal query is escaped here rather than at the call site so the
 * match scan and the replacement splice can never disagree about what the
 * pattern was.
 *
 * Whole-word is a `\b`-anchored non-capturing group rather than a bare wrap so
 * an alternation (`foo|bar`) keeps its own precedence.
 */
export function buildFindRegex(query: string, options: FindOptions): RegExp | null {
  if (!query) return null;
  const source = options.isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? 'g' : 'gi');
  } catch {
    return null;
  }
}

/**
 * Every match of `query` in `text`, in document order.
 *
 * Zero-width matches (`^`, `\b`, `a*`) are skipped: they have nothing to
 * highlight and nothing to replace, and stepping past them is what keeps the
 * scan terminating.
 */
export function findMatches(text: string, query: string, options: FindOptions): FindResult {
  const regex = buildFindRegex(query, options);
  if (!query) return { matches: [], truncated: false, invalid: false };
  if (!regex) return { matches: [], truncated: false, invalid: true };

  const matches: FindMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (matches.length >= MAX_FIND_MATCHES) return { matches, truncated: true, invalid: false };
  }
  return { matches, truncated: false, invalid: false };
}

/**
 * The match to call "current" for a caret/anchor at `offset`: the first one
 * that ends after it, so a caret sitting inside a match still counts as being
 * on that match. Wraps to the first match when the anchor is past the last one,
 * and reports -1 for an empty list.
 */
export function matchIndexAtOrAfter(matches: readonly FindMatch[], offset: number): number {
  if (matches.length === 0) return -1;
  for (let index = 0; index < matches.length; index++) {
    if (matches[index].end > offset) return index;
  }
  return 0;
}

/** Step one match forward (`1`) or back (`-1`), wrapping at either end. */
export function stepMatchIndex(index: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (index < 0) return direction === 1 ? 0 : count - 1;
  return (index + direction + count) % count;
}

/** What a replacement template is expanded against. */
export interface MatchGroups {
  /** `$&` — the whole match. */
  full: string;
  /** `$1`…`$99`, indexed by their own number: entry `n` is group `n` (`[0]` is unused). */
  numbered: readonly (string | undefined)[];
  /** `$<name>` — named capture groups. */
  named?: Record<string, string | undefined>;
}

/** The engine's own argument order: `found[1]` is `$1`. */
function groupsOf(found: RegExpExecArray): MatchGroups {
  return {
    full: found[0],
    numbered: [undefined, ...found.slice(1)],
    named: found.groups,
  };
}

const SUBSTITUTION = /\$(\$|&|\d{1,2}|<[^>]*>)/g;

/**
 * Expand a replacement template the way `String.prototype.replace` does for a
 * string replacement: `$$`, `$&`, `$1`–`$99` and `$<name>`. The prefix/suffix
 * forms (`` $` `` / `$'`) are deliberately left literal — nothing in the UI
 * offers them, and leaving the two characters alone is the honest reading.
 *
 * A two-digit group that does not exist falls back to the one-digit group plus
 * the second digit, which is the engine's own behaviour for `$12` when the
 * pattern has one group.
 */
export function expandReplacement(template: string, groups: MatchGroups): string {
  if (!template.includes('$')) return template;
  return template.replace(SUBSTITUTION, (_token, body: string) => {
    if (body === '$') return '$';
    if (body === '&') return groups.full;
    if (body.startsWith('<')) return groups.named?.[body.slice(1, -1)] ?? '';
    if (body.length === 2) {
      const direct = groups.numbered[Number(body)];
      if (direct !== undefined) return direct;
      const first = groups.numbered[Number(body[0])];
      return first === undefined ? '' : first + body[1];
    }
    return groups.numbered[Number(body)] ?? '';
  });
}

/**
 * Replace one match. Returns the new buffer and where the caret should land
 * (just after the inserted text), or null when the match is no longer there —
 * the regex is re-run at the match's own offset rather than trusting the
 * offsets handed in, so a stale list cannot splice the wrong range.
 */
export function replaceMatch(
  text: string,
  match: FindMatch,
  query: string,
  replacement: string,
  options: FindOptions,
): { text: string; caret: number } | null {
  const regex = buildFindRegex(query, options);
  if (!regex) return null;
  // The pattern is re-run at the match's own offset rather than trusting the
  // offsets handed in: a list computed against an older buffer cannot splice
  // the wrong range out of the current one.
  regex.lastIndex = match.start;
  const found = regex.exec(text);
  if (!found || found.index !== match.start) return null;
  if (!options.isRegex) {
    // Literal mode inserts the field verbatim: `$&` in the replace box is the
    // two characters the user typed, not the match.
    return {
      text: text.slice(0, match.start) + replacement + text.slice(match.end),
      caret: match.start + replacement.length,
    };
  }
  const inserted = expandReplacement(replacement, groupsOf(found));
  return {
    text: text.slice(0, found.index) + inserted + text.slice(found.index + found[0].length),
    caret: found.index + inserted.length,
  };
}

/** Replace every match. Null when the query is empty or does not compile. */
export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions,
): string | null {
  const regex = buildFindRegex(query, options);
  if (!regex) return null;
  if (!options.isRegex) return text.replace(regex, () => replacement);
  return text.replace(regex, (...args: unknown[]) => {
    // A replacer's arguments are `(match, …groups, offset, string, groups?)`;
    // rebuilding an exec result from them keeps one expansion rule for both
    // the single and the bulk path.
    const last = args[args.length - 1];
    const hasNamed = typeof last === 'object' && last !== null;
    const groups = args.slice(1, args.length - (hasNamed ? 3 : 2)) as string[];
    return expandReplacement(replacement, {
      full: String(args[0]),
      numbered: [undefined, ...groups],
      named: hasNamed ? (last as Record<string, string | undefined>) : undefined,
    });
  });
}
