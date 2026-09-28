/**
 * The log fold behind the update stream.
 *
 * Command output arrives in arbitrary chunks, so the state has to hold a
 * partial trailing line across frames — rendering a half-line as if it were
 * finished makes the log flicker between two spellings of the same line. The
 * fold lives here, apart from the hook, so it is unit-testable without a
 * process or a network.
 */

/** Cap on retained output; the tail is what matters when a step fails. */
export const UPDATE_LOG_LIMIT = 20_000;

export interface UpdateLogState {
  /** Lines complete enough to show. */
  lines: string[];
  /** Carried across frames: a chunk boundary can fall mid-line. */
  pending: string;
  /** Bytes were dropped from the head once the log passed the limit. */
  truncated: boolean;
}

/** Fold one streamed chunk into the log. */
export function appendUpdateLog(state: UpdateLogState, chunk: string): UpdateLogState {
  const parts = (state.pending + chunk).split('\n');
  const pending = parts.pop() ?? '';
  if (parts.length === 0) return { ...state, pending };

  let lines = [...state.lines, ...parts];
  let truncated = state.truncated;
  let length = lines.reduce((total, line) => total + line.length + 1, 0);
  let start = 0;
  // Keep the newest lines: a failing step reports at the end, and the head of a
  // long install log is the least useful thing on screen.
  while (length > UPDATE_LOG_LIMIT && start < lines.length - 1) {
    length -= (lines[start]?.length ?? 0) + 1;
    start += 1;
  }
  if (start > 0) {
    lines = lines.slice(start);
    truncated = true;
  }

  return { lines, pending, truncated };
}

/** The text to show: complete lines, then whatever partial line is in flight. */
export function updateLogText(state: UpdateLogState): string {
  return (state.pending ? [...state.lines, state.pending] : state.lines).join('\n');
}
