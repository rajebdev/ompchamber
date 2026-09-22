/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Line geometry and windowing policy for the lazy editor surface.
 *
 * Shiki tokenization is linear in document size (≈0.14 ms per line), so a
 * whole-file highlight costs ~0.8 s at 7 000 lines — and the editor pays it on
 * every keystroke, on top of one gutter node and one wrapped-row measurement
 * per line. A long document therefore renders only the lines the reader can
 * actually see, and this module is the DOM-free half of that: px offsets per
 * line, the viewport → line-range mapping, and the blank space the unrendered
 * lines take up so the caret never leaves its row.
 *
 * The browser measurements this needs (row height, per-line wrapped heights)
 * stay in the surface, which feeds them in as a `LineGeometry`.
 */

/** Documents at or below this size render whole — windowing them saves less than it costs. */
export const WHOLE_DOCUMENT_MAX_LINES = 300;
export const WHOLE_DOCUMENT_MAX_CHARS = 20_000;

/** Lines kept beyond the viewport so a fast scroll cannot outrun the window. */
export const WINDOW_OVERSCAN = 24;

/** Lines rendered before the first measurement lands; the surface corrects this in a layout effect. */
export const INITIAL_WINDOW_LINES = 200;

/** Half-open line range `[start, end)`. */
export interface LineWindow {
  start: number;
  end: number;
}

/** Blank space (px) the unrendered lines occupy above and below a window. */
export interface WindowSpace {
  top: number;
  bottom: number;
  /** The window reaches the document's last line, so it keeps the editor's trailing line break. */
  breakAtEnd: boolean;
}

/** A windowed render request: the lines to draw plus the space the rest of the document takes. */
export interface CodeWindow extends LineWindow, WindowSpace {}

/** Per-line vertical layout of a document, in px. */
export interface LineGeometry {
  readonly lineCount: number;
  /** Height (px) of a single visual row. */
  readonly rowHeight: number;
  /** Height (px) of every line together. */
  readonly totalHeight: number;
  /** Y offset (px) of the top edge of line `index`; `lineCount` is the document's end. */
  offsetOf(index: number): number;
  /** Index of the line covering `y`, clamped to the document. */
  lineAt(y: number): number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Whether a document is long enough that rendering all of it would be felt. */
export function shouldWindow(lineCount: number, charCount: number): boolean {
  return lineCount > WHOLE_DOCUMENT_MAX_LINES || charCount > WHOLE_DOCUMENT_MAX_CHARS;
}

/** Word wrap off: every line is exactly one row, so no measurement is involved. */
export function uniformGeometry(rowHeight: number, lineCount: number): LineGeometry {
  return {
    lineCount,
    rowHeight,
    totalHeight: rowHeight * lineCount,
    offsetOf: (index) => rowHeight * clamp(index, 0, lineCount),
    lineAt: (y) => clamp(Math.floor(y / rowHeight), 0, Math.max(lineCount - 1, 0)),
  };
}

/**
 * Word wrap on: heights are the measured wrapped heights, one entry per line.
 * Returns `null` when they do not describe every line, which leaves the caller
 * on the whole-document path rather than spacing lines with a wrong geometry.
 */
export function measuredGeometry(heights: number[], rowHeight: number, lineCount: number): LineGeometry | null {
  if (lineCount === 0 || heights.length !== lineCount) return null;
  const offsets = new Float64Array(lineCount + 1);
  for (let i = 0; i < lineCount; i++) offsets[i + 1] = offsets[i] + heights[i];
  const total = offsets[lineCount];
  return {
    lineCount,
    rowHeight,
    totalHeight: total,
    offsetOf: (index) => offsets[clamp(index, 0, lineCount)],
    lineAt: (y) => {
      if (y < 0) return 0;
      if (total <= 0 || y >= total) return lineCount - 1;
      // Last line whose top edge sits at or above `y`.
      let low = 0;
      let high = lineCount - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (offsets[mid] <= y) low = mid;
        else high = mid - 1;
      }
      return low;
    },
  };
}

/** The lines a viewport band (`top`, `height`) covers, plus overscan on both sides. */
export function resolveWindow(
  geometry: LineGeometry,
  top: number,
  height: number,
  overscan: number = WINDOW_OVERSCAN,
): LineWindow {
  const first = geometry.lineAt(top);
  const last = geometry.lineAt(top + Math.max(height, 0));
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(geometry.lineCount, Math.max(last + 1, first + 1) + overscan),
  };
}

/** What a freshly opened document renders before its viewport has been read. */
export function firstWindow(lineCount: number): LineWindow {
  return { start: 0, end: clamp(INITIAL_WINDOW_LINES, 1, Math.max(lineCount, 1)) };
}

/** Keep a window inside the document it belongs to (the state may predate a file switch). */
export function clampWindow(window: LineWindow, lineCount: number): LineWindow {
  const start = clamp(window.start, 0, Math.max(lineCount - 1, 0));
  return { start, end: clamp(window.end, start + 1, Math.max(lineCount, 1)) };
}

export function sameWindow(a: LineWindow | null, b: LineWindow | null): boolean {
  return a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end);
}

/** Space the unrendered lines take around `window`, and whether it ends the document. */
export function windowSpace(geometry: LineGeometry, window: LineWindow): WindowSpace {
  const top = geometry.offsetOf(window.start);
  return {
    top,
    bottom: Math.max(0, geometry.totalHeight - geometry.offsetOf(window.end)),
    breakAtEnd: window.end >= geometry.lineCount,
  };
}

/** Clamp a window to its document and resolve the space it leaves around itself. */
export function codeWindow(geometry: LineGeometry, window: LineWindow): CodeWindow {
  const clamped = clampWindow(window, geometry.lineCount);
  return { ...clamped, ...windowSpace(geometry, clamped) };
}
