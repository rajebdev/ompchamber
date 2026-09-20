import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * Fade-in/out state for overlay scrollbars: the thumb is visible while the
 * user scrolls and fades out shortly after they stop. Mirrors the chat
 * timeline's isScrolling behavior for any scrollable panel.
 */
export function useScrollbarFade(delayMs = 600) {
  const [isScrolling, setIsScrolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsScrolling(false), delayMs);
  }, [delayMs]);

  // The fade timer outlives a scroll that was still cooling down at unmount:
  // clear it so it cannot call setIsScrolling on a dead component.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { isScrolling, handleScroll };
}

/**
 * The overlay-scrollbar class pair driven by `isScrolling`. Centralised so every
 * fading scroll container applies the exact same two class names.
 */
export function scrollbarFadeClass(isScrolling: boolean): string {
  return isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay';
}
