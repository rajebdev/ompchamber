/**
 * Release-body presentation for the "What's new" popup.
 *
 * A GitHub release body here IS the changelog section for that tag, and it opens
 * with the very heading the popup draws itself:
 *
 *     ## [3.8.0](…/compare/v3.7.1...v3.8.0) — 2026-09-29
 *
 * Rendering it verbatim would print that line twice per version — once as the
 * popup's own heading, once inside the note. So the leading heading is split off
 * rather than rendered, and the date it carries is kept: a release published
 * without `published_at` still gets a date on screen.
 *
 * The rest of the body is returned UNTOUCHED. It is changelog prose with links,
 * bold labels and commit hashes, and any normalization beyond the heading would
 * be this module inventing a second renderer for markdown the popup already has.
 */

/** `## [3.8.0](url) — 2026-09-29`, tolerating the plain `## v3.8.0` spelling. */
const LEADING_HEADING = /^##\s+\[?v?(\d[\w.-]*)\]?(?:\([^)]*\))?\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

export interface ReleaseBodyParts {
  /** The heading's date, when it carried one. */
  date: string | null;
  /** The body with its leading heading line removed. */
  markdown: string;
}

/**
 * Split a release body into its heading date and the prose below it. A body that
 * does not open with a heading is returned as-is with no date — GitHub allows a
 * hand-written release note, and that shape must render too.
 */
export function splitReleaseBody(markdown: string): ReleaseBodyParts {
  const lines = markdown.split('\n');
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex === -1) return { date: null, markdown: '' };

  const match = LEADING_HEADING.exec(lines[firstIndex]!.trim());
  if (!match) return { date: null, markdown };

  // Drop the heading and the blank lines that separated it from the prose, so
  // the rendered note starts on its first real line.
  let rest = firstIndex + 1;
  while (rest < lines.length && lines[rest]!.trim().length === 0) rest += 1;

  return { date: match[2] ?? null, markdown: lines.slice(rest).join('\n').trim() };
}
