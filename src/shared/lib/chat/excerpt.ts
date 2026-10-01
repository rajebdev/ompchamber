/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The excerpt format omp answers `edit`/`write`/`read` with: the lines a tool
 * touched, each prefixed by its number in the file, grouped under a
 * `[path#TAG]` header — one group per file the patch modified.
 *
 *   [src/shared/lib/chat/xml-envelope.ts]
 *   121:function stripCommonIndent(text: string): string {
 *   134:}
 *
 * The header is a label, not a line of code, and the number prefix is a gutter,
 * not content — rendered as markdown the whole result collapses into one plain
 * code block with the path sitting inside it as its first line. Anything that is
 * not a numbered row or a header is prose: an error ("Could not find a close
 * enough match"), a warning about a boundary echo, a trailing system reminder.
 * Prose is carried as `notes` so it renders as markdown instead of as code.
 */

export interface EditOutputSection {
  /** File the excerpt belongs to, from its `[path#TAG]` header. */
  path?: string;
  /** Read-snapshot tag omp printed after the path, when it printed one. */
  tag?: string;
  /** Numbered excerpt rows, verbatim. */
  lines: string[];
  /** Prose around the rows: warnings, errors, a trailing reminder. */
  notes: string[];
}

/** `[PATH#TAG]` header line → path + snapshot tag. The closing bracket is
 *  optional in omp's parser, and the tag is only stripped when it is 4 hex. */
const HEADER_RE = /^\[([^\[\]]+?)(?:#([0-9a-fA-F]{4}))?\]$/;
/** `115:code` — an excerpt row's gutter number. */
const ROW_RE = /^\s*\d+:/;
/** `[115ln elided; re-read needed ranges with …]`, `[Showing lines 54-103 of 208]`. */
const ELISION_RE = /^\[[^\]]*(?:elided|Showing lines|results limit|more lines)[^\]]*\]$/;

/** True when a line is a gap marker rather than a code row: omp prints a bare
 *  `…` where the excerpt skipped lines, and the numbers on either side already
 *  show the jump, so the marker is a layout cue rather than content. */
function isElisionLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '…' || trimmed === '...' || ELISION_RE.test(trimmed);
}

/** Every excerpt group the tool result carries, in order.
 *
 *  A `[path#TAG]` line opens a group only when numbered rows follow it — an
 *  error that quotes a path in brackets is prose, and a warning that happens to
 *  start with digits is a warning, so a group's rows end at its first non-row.
 *  A result with no group at all (an error, a reminder, a `write` byte count)
 *  comes back as a single section whose `notes` hold the whole text. */
export function parseEditOutput(text: string): EditOutputSection[] {
  const lines = text.split(/\r?\n/);
  const sections: EditOutputSection[] = [];
  let current: EditOutputSection = { lines: [], notes: [] };
  sections.push(current);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const header = HEADER_RE.exec(line.trim());
    const path = header?.[1].trim();
    // The header is only a header when a numbered row follows it: that is what
    // separates a group title from an error quoting a path in brackets.
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next += 1;
    if (path && next < lines.length && ROW_RE.test(lines[next])) {
      current = { path, ...(header![2] ? { tag: header![2] } : {}), lines: [], notes: [] };
      sections.push(current);
      continue;
    }
    if (!line.trim()) {
      // A blank row separates groups and prose paragraphs; an excerpt's own
      // empty lines carry their number prefix, so an unprefixed blank is spacing.
      if (current.notes.length > 0) current.notes.push(line);
      continue;
    }
    if (isElisionLine(line)) continue;
    if (current.path && ROW_RE.test(line) && current.notes.length === 0) current.lines.push(line);
    else current.notes.push(line);
  }

  return sections.filter((section) => section.path || section.notes.some((note) => note.trim()));
}
