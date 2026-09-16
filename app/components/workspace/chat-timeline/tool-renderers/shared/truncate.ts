/** Maximum number of lines rendered into the DOM for a single tool output. */
export const MAX_OUTPUT_LINES = 1000;

export interface TruncateTailResult {
  /** The last `maxLines` lines — or the original text when it is short enough. */
  text: string;
  /** How many leading lines were dropped (0 when nothing was hidden). */
  skipped: number;
}

/** Keep only the last `maxLines` lines of `text`, reporting how many were dropped.
 *  Display-only helper: never use the result for persistence or clipboard payloads. */
export function truncateTailLines(text: string, maxLines: number = MAX_OUTPUT_LINES): TruncateTailResult {
  if (!text) return { text: '', skipped: 0 };
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return { text, skipped: 0 };
  return { text: lines.slice(lines.length - maxLines).join('\n'), skipped: lines.length - maxLines };
}
