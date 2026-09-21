/**
 * Right developer panel catalog: the activity-bar views, the width each one
 * opens at, and the floor at which its content starts to clip.
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
] as const;

export type RightPanelType = (typeof RIGHT_PANEL_TYPES)[number];

/** Width (px) a view opens at the first time it is shown. */
export const DEFAULT_RIGHT_PANEL_WIDTHS: Record<RightPanelType, number> = {
  files: 268,
  search: 268,
  git: 268,
  // 80 columns at the terminal's 12px Fira Code (≈7.2px/char) need ≈600px
  // before the scrollbar; the old 536 landed at ≈74 columns and wrapped.
  terminal: 640,
  context: 536,
  'user-browser': 804,
  browser: 804,
  usage: 536,
};

/** Minimum width (px) each view needs before its toolbar or list breaks. */
export const MIN_RIGHT_PANEL_WIDTHS: Record<RightPanelType, number> = {
  files: 200,
  search: 200,
  git: 260,
  // A 200px terminal is ≈27 columns — below every shell's assumption; 320
  // holds a two-pane TUI or a git log with the graph.
  terminal: 320,
  context: 420,
  'user-browser': 320,
  browser: 320,
  usage: 420,
};

export const MAX_RIGHT_PANEL_WIDTH = 1200;

/** Guards a persisted or URL-provided view id before it keys a width. */
export function isRightPanelType(value: unknown): value is RightPanelType {
  return typeof value === 'string' && (RIGHT_PANEL_TYPES as readonly string[]).includes(value);
}
