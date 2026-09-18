/**
 * Right developer panel catalog: the activity-bar views, the width each one
 * opens at, and the floor at which its content starts to clip.
 *
 * The list lives here rather than in the activity bar component so the layout
 * can key one remembered width per view (`panel-widths.ts`) and validate a
 * stored blob without importing UI.
 */
export const RIGHT_PANEL_TYPES = [
  'files',
  'search',
  'git',
  'terminal',
  'context',
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
  terminal: 536,
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
  terminal: 200,
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
