/**
 * Per-panel width state for the desktop layout.
 *
 * Every resizable surface remembers its OWN width: the session sidebar, the
 * editor panel (source and diff tabs separately, since a diff wants room a
 * file view does not) and each right-panel view (see `right-panels.ts`).
 * Collapsing those into one slot per group is what made switching a panel look
 * like a reset. The chat column is the group's filler — flexbox sizes it — so
 * it has no remembered width, only a floor it may not be pushed below.
 *
 * Sizes are pixels — the unit the panel constraints are written in — and are
 * persisted as `app_settings.desktopLayoutSizes`.
 */
import { isRightPanelType, type RightPanelType } from '@/shared/lib/workspace/right-panels';

/** The editor panel keeps a separate width while a diff tab is active. */
export type EditorWidthMode = 'editor' | 'diff';

export interface PanelWidths {
  /** Session sidebar. */
  left?: number;
  /** Editor panel while a source file tab is active. */
  editor?: number;
  /** Editor panel while a diff tab is active. */
  diff?: number;
  /** Right panel, keyed by the activity-bar view it currently shows. */
  right?: Partial<Record<RightPanelType, number>>;
}

/** Fallbacks for panels that have never been resized. */
export const DEFAULT_PANEL_WIDTHS: Record<EditorWidthMode | 'left', number> = {
  left: 268,
  editor: 600,
  // Side-by-side diffs need both halves readable at once: `SplitView` states a
  // 700px floor of its own, so anything below it scrolls sideways on open.
  diff: 720,
};

/**
 * Panel floors and ceilings. The sidebar ceiling and the chat floor are a pair:
 * `MIN_CHAT_PANEL_WIDTH` is what stops the workspace stack from eating the
 * conversation, and it is also why the sidebar cannot open past 520 and still
 * leave the editor (300) and a browser view (320) room on a 1440px display.
 */
export const MIN_LEFT_PANEL_WIDTH = 200;
export const MAX_LEFT_PANEL_WIDTH = 520;
export const MIN_CHAT_PANEL_WIDTH = 420;
export const MIN_EDITOR_PANEL_WIDTH = 300;
export const MAX_EDITOR_PANEL_WIDTH = 1200;

function pixelWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/**
 * Coerce a stored blob into the current shape. Blobs written before per-view
 * widths held the right panel as a single number shared by every view; that
 * number belongs to whichever view was open when it was written, so it seeds
 * `legacyView` alone instead of being copied onto all eight.
 */
export function normalizePanelWidths(raw: unknown, legacyView: RightPanelType): PanelWidths {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;

  const widths: PanelWidths = {};
  for (const key of ['left', 'editor', 'diff'] as const) {
    const value = pixelWidth(source[key]);
    if (value !== undefined) widths[key] = value;
  }

  const right: Partial<Record<RightPanelType, number>> = {};
  if (source.right && typeof source.right === 'object') {
    for (const [view, value] of Object.entries(source.right as Record<string, unknown>)) {
      if (!isRightPanelType(view)) continue;
      const size = pixelWidth(value);
      if (size !== undefined) right[view] = size;
    }
  } else {
    const legacy = pixelWidth(source.right);
    if (legacy !== undefined) right[legacyView] = legacy;
  }
  if (Object.keys(right).length > 0) widths.right = right;

  return widths;
}

/** Fold a freshly measured patch over the stored widths (one level deep for `right`). */
export function mergePanelWidths(current: PanelWidths, patch: PanelWidths): PanelWidths {
  const next: PanelWidths = { ...current, ...patch };
  if (patch.right) next.right = { ...current.right, ...patch.right };
  return next;
}
