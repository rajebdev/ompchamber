/**
 * Per-panel width state for the desktop layout.
 *
 * Every resizable surface remembers its OWN width: the session sidebar, the
 * chat column, the editor panel (source and diff tabs separately, since a diff
 * wants room a file view does not) and each right-panel view. Collapsing those
 * into one slot per group is what made switching a panel look like a reset.
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
  /** Chat timeline column, the inner stack's first panel. */
  chat?: number;
  /** Editor panel while a source file tab is active. */
  editor?: number;
  /** Editor panel while a diff tab is active. */
  diff?: number;
  /** Right panel, keyed by the activity-bar view it currently shows. */
  right?: Partial<Record<RightPanelType, number>>;
}

/** Fallbacks for panels that have never been resized. */
export const DEFAULT_PANEL_WIDTHS: Record<EditorWidthMode | 'left' | 'chat', number> = {
  left: 268,
  chat: 540,
  editor: 536,
  diff: 536,
};

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
  for (const key of ['left', 'chat', 'editor', 'diff'] as const) {
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
