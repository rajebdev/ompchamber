import { useCallback, useEffect, useRef } from 'preact/hooks';

/**
 * Overlay-scrollbar fade without a re-render.
 *
 * The hook it replaces held the flag in `useState`, so every scroll event
 * re-rendered its owner — and on a list of tens of thousands of rows that is
 * the whole list, because Preact has no automatic memoization. Measured on the
 * search panel: one five-step scroll over 19,376 rows blocked the main thread
 * for 34 s, and the profile put 70% of it inside the highlighter the rows
 * re-ran on each pass.
 *
 * The scrollbar thumb is a CSS class, so the flag does not need React state at
 * all: the classes are toggled on the element through a ref, and the component
 * tree is left alone.
 */

const FADE_DELAY_MS = 600;

/** The two overlay class names, and nothing else. */
const SCROLLING_CLASS = 'scrollbar-overlay-scrolling';
const IDLE_CLASS = 'scrollbar-overlay';

export interface ScrollbarFadeProps {
  /** Attach to the `.scrollbar-overlay-container` element. */
  ref: (element: HTMLElement | null) => void;
  onScroll: () => void;
}

/**
 * Attach to any `.scrollbar-overlay-container`: it takes the ref, wires the
 * scroll handler, and applies the idle class on mount.
 *
 * A hook rather than a plain helper because the fade timer must be cleared on
 * unmount — a timer left behind would touch a detached element.
 */
export function useScrollbarFadeRef(delayMs = FADE_DELAY_MS): ScrollbarFadeProps {
  const elementRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const setElement = useCallback((element: HTMLElement | null) => {
    const previous = elementRef.current;
    if (previous && previous !== element) {
      previous.classList.remove(SCROLLING_CLASS);
      previous.classList.add(IDLE_CLASS);
    }
    elementRef.current = element;
    if (element) {
      element.classList.add(IDLE_CLASS);
      element.classList.remove(SCROLLING_CLASS);
    }
  }, []);

  const onScroll = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    element.classList.add(SCROLLING_CLASS);
    element.classList.remove(IDLE_CLASS);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      // Re-read the ref: the element may have been swapped or unmounted since.
      const current = elementRef.current;
      if (!current) return;
      current.classList.remove(SCROLLING_CLASS);
      current.classList.add(IDLE_CLASS);
    }, delayMs);
  }, [delayMs]);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    },
    [],
  );

  return { ref: setElement, onScroll };
}
