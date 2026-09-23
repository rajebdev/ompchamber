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
 * Two units, deliberately:
 *
 * - The **sidebar** is pixels. It holds a session list, which does not get more
 *   useful on a wider monitor, and OpenChamber's sidebar is pixels too.
 * - The **editor and right panels** are a *share of the group's available
 *   area*. A pixel width is only right on the display it was dragged on; a
 *   fraction follows a window resize. A remembered pixel value is kept
 *   alongside as the fallback for the window before the area is measured and
 *   for blobs written before the fraction existed.
 *
 * Sizes persist as `app_settings.desktopLayoutSizes`.
 */
import { isRightPanelType, type RightPanelType } from '@/shared/lib/workspace/right-panels';

/** The editor panel keeps a separate width while a diff tab is active. */
export type EditorWidthMode = 'editor' | 'diff';

/**
 * A panel width in both units. `fraction` is authoritative once the group's
 * area is known; `px` is what the panel falls back to before then, and what a
 * blob written before fractions existed carries.
 */
export interface PanelWidth {
  px?: number;
  fraction?: number;
}

export interface PanelWidths {
  /** Session sidebar. Pixels only — it does not scale with the window. */
  left?: number;
  /** Editor panel while a source file tab is active. */
  editor?: PanelWidth;
  /** Editor panel while a diff tab is active. */
  diff?: PanelWidth;
  /** Right panel, keyed by the activity-bar view it currently shows. */
  right?: Partial<Record<RightPanelType, PanelWidth>>;
}

/**
 * Fraction each editor mode opens at, and the px width used before the group's
 * area is known. The diff fraction matches OpenChamber's `diff` surface (3/5);
 * its px fallback stays wider than the source editor's because `SplitView`
 * states a 700px floor of its own, so anything below it scrolls sideways.
 */
export const DEFAULT_EDITOR_FRACTIONS: Record<EditorWidthMode, number> = {
  editor: 0.6,
  diff: 0.6,
};

export const DEFAULT_EDITOR_WIDTHS: Record<EditorWidthMode, number> = {
  editor: 600,
  diff: 720,
};

/** Fallback for the sidebar, which has no fraction. */
export const DEFAULT_LEFT_PANEL_WIDTH = 280;

/**
 * Panel floors and ceilings. The sidebar ceiling and the chat floor are a pair:
 * `MIN_CHAT_PANEL_WIDTH` is what stops the workspace stack from eating the
 * conversation, and it is also why the sidebar cannot open past 500 and still
 * leave the editor (320) and a browser view (320) room on a 1440px display.
 *
 * `MIN_EDITOR_PANEL_WIDTH` matches the shared right-panel floor so the two
 * panels cannot disagree about the narrowest width the same content is shown
 * at.
 */
export const MIN_LEFT_PANEL_WIDTH = 264;
export const MAX_LEFT_PANEL_WIDTH = 500;
export const MIN_CHAT_PANEL_WIDTH = 400;
export const MIN_EDITOR_PANEL_WIDTH = 320;

/** Draggable separator width in px (`w-[3px]` in `ResizeHandle`). */
export const HANDLE_WIDTH = 3;

/** How much of a drag may re-apply the real width, in ms. */
export const RESIZE_FOLLOW_INTERVAL_MS = 100;

export interface ResolveWidthArgs {
  /** Remembered width for this slot, if the user ever resized it. */
  stored?: PanelWidth;
  /** Fraction this slot opens at when nothing was remembered. */
  defaultFraction: number;
  /** px this slot opens at before the area is known. */
  defaultPx: number;
  /** Measured area of the group, or null before the observer reports. */
  available: number | null;
  min: number;
  /** Floors the other fixed panels in the same group must keep. */
  siblingMin: number;
  /** Separators in the group, which also consume width. */
  handleCount: number;
}

/**
 * Resolve one panel's width in px.
 *
 * The ceiling is dynamic — `available − chat floor − the other panels' floors`
 * — rather than a fixed number, because a fixed one either wastes a large
 * monitor or eats the chat on a small one. Both the editor and the right panel
 * compete for the same budget, so whichever renders first takes its share and
 * the other gets what is left; the caller passes `siblingMin` to say which.
 *
 * Without a measured area there is no budget to divide, so the stored or
 * default pixel width is used unchanged.
 */
export function resolvePanelWidth(args: ResolveWidthArgs): number {
  const { stored, defaultFraction, defaultPx, available, min, siblingMin, handleCount } = args;

  if (available === null || available <= 0) return Math.max(min, Math.round(stored?.px ?? defaultPx));

  const ceiling = Math.max(
    min,
    Math.floor(available - MIN_CHAT_PANEL_WIDTH - siblingMin - handleCount * HANDLE_WIDTH),
  );

  // A remembered fraction wins. A px-only value is honoured as written — the
  // conversion below is an identity, deliberately: a pixel width someone chose
  // is not silently rescaled, and it starts following the window only once that
  // slot is dragged, which stores a fraction beside it. Reading rather than
  // rewriting the stored blob is also what keeps a session's own widths from
  // being clobbered by the global seed before that session's blob has loaded.
  const fraction = stored?.fraction
    ?? (stored?.px != null ? Math.min(1, stored.px / available) : defaultFraction);
  const wanted = Math.round(fraction * available);

  return Math.min(Math.max(wanted, min), ceiling);
}

function panelWidth(value: unknown): PanelWidth | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { px: Math.round(value) } : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;

  const source = value as Record<string, unknown>;
  const px = Number.isFinite(source.px) && (source.px as number) > 0 ? Math.round(source.px as number) : undefined;
  const fraction = Number.isFinite(source.fraction) && (source.fraction as number) > 0 && (source.fraction as number) <= 1
    ? (source.fraction as number)
    : undefined;

  if (px === undefined && fraction === undefined) return undefined;
  return { ...(px !== undefined ? { px } : {}), ...(fraction !== undefined ? { fraction } : {}) };
}

function sidebarWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/**
 * Coerce a stored blob into the current shape.
 *
 * Three older shapes are accepted, because a user's layout must survive the
 * upgrade rather than silently reset:
 *
 * - a bare number is the px-only shape this app shipped before fractions;
 * - a single number under `right` is older still, holding one width shared by
 *   every view — it belongs to whichever view was open when it was written, so
 *   it seeds `legacyView` alone instead of being copied onto all eight;
 * - an unknown `right` key is dropped rather than trusted.
 *
 * Nothing is converted to a fraction here: this function is pure and the
 * conversion needs the group's measured area. The layout performs it once the
 * area is known (see `usePanelWidths`).
 */
export function normalizePanelWidths(raw: unknown, legacyView: RightPanelType): PanelWidths {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;

  const widths: PanelWidths = {};
  const left = sidebarWidth(source.left);
  if (left !== undefined) widths.left = left;
  for (const key of ['editor', 'diff'] as const) {
    const value = panelWidth(source[key]);
    if (value !== undefined) widths[key] = value;
  }

  const right: Partial<Record<RightPanelType, PanelWidth>> = {};
  if (source.right && typeof source.right === 'object') {
    for (const [view, value] of Object.entries(source.right as Record<string, unknown>)) {
      if (!isRightPanelType(view)) continue;
      const size = panelWidth(value);
      if (size !== undefined) right[view] = size;
    }
  } else {
    const legacy = panelWidth(source.right);
    if (legacy !== undefined) right[legacyView] = legacy;
  }
  if (Object.keys(right).length > 0) widths.right = right;

  return widths;
}

/**
 * Fold a freshly measured patch over the stored widths (one level deep for
 * `right`, and within a slot for its two units — a fraction patch must not
 * discard the px fallback it was derived from).
 */
export function mergePanelWidths(current: PanelWidths, patch: PanelWidths): PanelWidths {
  const next: PanelWidths = { ...current, ...patch };
  if (patch.right) {
    const right: Partial<Record<RightPanelType, PanelWidth>> = { ...current.right };
    for (const [view, value] of Object.entries(patch.right)) {
      if (!isRightPanelType(view) || !value) continue;
      right[view] = { ...current.right?.[view], ...value };
    }
    next.right = right;
  }
  for (const key of ['editor', 'diff'] as const) {
    if (patch[key]) next[key] = { ...current[key], ...patch[key] };
  }
  return next;
}
