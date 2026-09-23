import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Measure an element's content width and keep it current.
 *
 * Panel widths are stored as a share of the group's available area, so the
 * group has to report that area before any fraction can become pixels. Returns
 * `null` until the first measurement — callers must treat that as "unknown",
 * not as zero, or a panel would collapse on its first render.
 *
 * `ResizeObserver` is not optional here: the width changes on a window resize,
 * on a devtools dock, and on a sibling panel being toggled, and none of those
 * are `window` events.
 */
export function useAvailableWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      setAvailable(element.clientWidth || null);
    });
    observer.observe(element);
    setAvailable(element.clientWidth || null);

    return () => observer.disconnect();
  }, [ref]);

  return available;
}
