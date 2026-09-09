import { useCallback, useRef, useState } from 'react';

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

  return { isScrolling, handleScroll };
}
