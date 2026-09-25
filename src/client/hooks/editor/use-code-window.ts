import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

import { codeWindow, firstWindow, resolveWindow, sameWindow, type CodeWindow, type LineGeometry, type LineWindow } from '@/shared/lib/code/lazy-window';
import { findScrollContainer } from '@/client/hooks/editor/scroll-container';

export interface UseCodeWindowOptions {
  /** The surface's root box: the frame every line offset in `geometry` is measured from. */
  rootRef: RefObject<HTMLElement | null>;
  /** Lines in the document on screen. */
  lineCount: number;
  /** Document geometry, or null until the wrap/row measurement lands. */
  geometry: LineGeometry | null;
  /** False for short documents (they render whole) and when geometry cannot be measured. */
  enabled: boolean;
}

/**
 * The lines visible inside the scroll container `root` lives in.
 *
 * Both rectangles are read in viewport coordinates, so this needs no knowledge
 * of scroll offsets: the part of the editor's box the container actually shows
 * is exactly the band between the two.
 */
function visibleWindow(root: HTMLElement, geometry: LineGeometry): LineWindow {
  const frameTop = root.getBoundingClientRect().top;
  const container = findScrollContainer(root);
  const viewTop = container ? container.getBoundingClientRect().top : 0;
  const viewBottom = container
    ? container.getBoundingClientRect().bottom
    : globalThis.innerHeight || geometry.rowHeight;
  return resolveWindow(geometry, viewTop - frameTop, viewBottom - viewTop);
}

/**
 * Rendering window for the lazy editor surface.
 *
 * A long document is highlighted, gutters and all, only where it can be seen;
 * this hook owns which lines those are and re-resolves them on scroll, on
 * resize, and whenever the geometry moves (a keystroke re-wraps a line). The
 * scroll listener is a capturing one on the window: scroll events do not
 * bubble, but they do reach a capturing listener, so the surface follows
 * whichever ancestor scrolls — the desktop editor panel, the phone's
 * full-screen editor, or the page.
 *
 * Returns null for a document that renders whole, which is the caller's cue to
 * keep the plain, unwindowed surface.
 */
export function useCodeWindow({ rootRef, lineCount, geometry, enabled }: UseCodeWindowOptions): CodeWindow | null {
  const [lineWindow, setLineWindow] = useState<LineWindow | null>(null);

  const compute = useCallback(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const next = geometry ? visibleWindow(root, geometry) : firstWindow(lineCount);
    setLineWindow((previous) => (sameWindow(previous, next) ? previous : next));
  }, [enabled, geometry, lineCount, rootRef]);

  // Layout effect: the first window has to be resolved before the browser
  // paints, or a long document flashes its untouched opening lines.
  useLayoutEffect(() => {
    compute();
  }, [compute]);

  // The listeners follow `enabled`, not `compute`: re-resolving on every
  // keystroke must not tear down and rebuild the observer each time.
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        computeRef.current();
      });
    };
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const root = rootRef.current;
    if (root) observer?.observe(root);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [enabled, rootRef]);

  if (!enabled) return null;
  if (!geometry) {
    // First commit: the layout effect above lands the real window in the same
    // frame, so this only bounds how much the opening render is allowed to draw.
    const opening = firstWindow(lineCount);
    return { ...opening, top: 0, bottom: 0, breakAtEnd: opening.end >= lineCount };
  }
  return codeWindow(geometry, lineWindow ?? firstWindow(geometry.lineCount));
}
