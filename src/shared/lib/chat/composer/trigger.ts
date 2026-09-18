import type { ComposerPickItem, ComposerTrigger } from '@/shared/types';

/** Chars that may legally precede an `@` agent trigger (besides string start). */
const AT_PRECEDING_RE = /[\s([{]/;

/**
 * Detect an `@`-mention (files + agents) or `/`-command trigger at the given
 * caret position.
 *
 * Scans backwards from `caret - 1`: a whitespace/newline before any trigger
 * char aborts the scan. `/` is only a trigger at index 0; `@` is a trigger at
 * index 0 or when preceded by whitespace, `(`, `[`, or `{`. The query is the
 * run of non-whitespace characters between the trigger char and the caret, so
 * `foo@bar` and `a/b` (query containing another trigger char) never match.
 */
export function detectComposerTrigger(text: string, caret: number): ComposerTrigger | null {
  const end = Math.max(0, Math.min(caret, text.length));

  for (let i = end - 1; i >= 0; i--) {
    const ch = text[i];

    if (/\s/.test(ch)) return null;

    if (ch === '/' || ch === '@') {
      if (ch === '/') {
        if (i !== 0) return null;
        return { kind: 'command', query: text.slice(i + 1, end), start: i, end };
      }

      if (i === 0 || AT_PRECEDING_RE.test(text[i - 1])) {
        return { kind: 'mention', query: text.slice(i + 1, end), start: i, end };
      }
      return null;
    }
  }

  return null;
}

/** Insertion text for an item: its token followed by a single trailing space. */
export function tokenForItem(item: ComposerPickItem): string {
  return `${item.token} `;
}

/** Splice `token` over the trigger span in `value`, returning the new value and caret. */
export function insertToken(
  value: string,
  trigger: ComposerTrigger,
  token: string,
): { value: string; caret: number } {
  const next = value.slice(0, trigger.start) + token + value.slice(trigger.end);
  return { value: next, caret: trigger.start + token.length };
}
