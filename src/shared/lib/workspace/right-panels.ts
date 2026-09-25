/**
 * Right developer panel catalog: the activity-bar views, the share of the
 * group's available area each one opens at, and the floor at which its content
 * clips.
 *
 * The list lives here rather than in the activity bar component so the layout
 * can key one remembered width per view (`panel-widths.ts`) and validate a
 * stored blob without importing UI. It is also the single source of the views'
 * *order*: the desktop activity bar, the desktop panel stack and the phone's
 * tab bar all render from it, so the two layouts cannot drift apart.
 */
export const RIGHT_PANEL_TYPES = [
  'context',
  'files',
  'search',
  'git',
  'terminal',
  'user-browser',
  'browser',
  'usage',
  'todo',
] as const;

export type RightPanelType = (typeof RIGHT_PANEL_TYPES)[number];

/**
 * Share of the group's available area a view takes the first time it is shown.
 *
 * A fraction rather than a pixel width is what lets a panel follow a window
 * resize instead of holding a number that was only right on the display it was
 * dragged on. Where OpenChamber ships the same surface its `defaultWidthFraction`
 * is reused verbatim; the rest are derived.
 *
 * - `files` is the file tree *alone*. OpenChamber's 3/5 `file` surface holds a
 *   tree **and** an editor column, so its fraction is not ours to borrow — their
 *   tree-only column is 200–480px, which is what this 0.22 approximates at a
 *   1440-class viewport.
 * - `search` matches `files`: both are single narrow columns of rows.
 * - `usage` has no OpenChamber counterpart; 0.48 keeps the pixel default it
 *   shipped with.
 * - `todo` has no OpenChamber counterpart either; 0.3 keeps its pixel default.
 * - `context`, `git`, `terminal` and both browsers take OpenChamber's values.
 */
export const DEFAULT_RIGHT_PANEL_FRACTIONS: Record<RightPanelType, number> = {
  context: 0.45,
  files: 0.22,
  search: 0.22,
  git: 0.4,
  // 80 columns at the terminal's 12px Fira Code (≈7.2px/char) need ≈600px.
  terminal: 0.6,
  'user-browser': 0.45,
  browser: 0.45,
  usage: 0.48,
  // A todo list is one column of short rows — narrower than usage, wider than
  // a file tree, because a task line is a sentence.
  todo: 0.3,
};

/**
 * Width (px) a view opens at before the group's area has been measured. Kept at
 * the values these views shipped with, so the first paint is unchanged and a
 * window that never reports an area still opens sensibly.
 */
export const DEFAULT_RIGHT_PANEL_WIDTHS: Record<RightPanelType, number> = {
  context: 536,
  files: 268,
  search: 268,
  git: 268,
  terminal: 640,
  'user-browser': 804,
  browser: 804,
  usage: 536,
  todo: 384,
};

/**
 * Minimum width (px) each view needs before its toolbar or list breaks.
 *
 * Per view, not one shared floor: a file tree reads fine at 200 while a shell
 * does not, and OpenChamber draws the same line (its tree-only column floors at
 * 200, its shared panel at 320). A uniform floor would either clip the tree or
 * force every view to shell width.
 */
export const MIN_RIGHT_PANEL_WIDTHS: Record<RightPanelType, number> = {
  files: 200,
  search: 200,
  // The commit graph is a fixed-width gutter plus a message column.
  git: 260,
  // A 320px terminal is ≈27 columns — below every shell's assumption, but the
  // point where a two-pane TUI or a git log with the graph still reads.
  terminal: 320,
  // Telemetry charts and tables need room before they wrap.
  context: 420,
  'user-browser': 320,
  browser: 320,
  usage: 420,
  // Below this a task line wraps to three words a row.
  todo: 280,
};

/** Guards a persisted or URL-provided view id before it keys a width. */
export function isRightPanelType(value: unknown): value is RightPanelType {
  return typeof value === 'string' && (RIGHT_PANEL_TYPES as readonly string[]).includes(value);
}
