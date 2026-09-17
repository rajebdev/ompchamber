/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Throttled revalidation for the session sidebars.
 *
 * `omp:session-updated` fires on every stream frame while a run is active
 * (agent_start, meta refresh, spawn adoption, JSONL writes) — each dispatch
 * would otherwise trigger a full loader revalidation, and with two sidebars
 * mounted (desktop + mobile layouts keep theirs alive) a busy run could
 * revalidate several times per second.
 *
 * Trailing-throttle: the first event arms a timer, further events inside the
 * window extend it; the loader revalidates once, ~1s after the last event.
 * The event stream settles quickly after a spawn/title change, so the list
 * still feels immediate while a streaming run coalesces to one revalidate
 * per second instead of one per frame.
 */

import { useEffect, useRef } from 'react';

/** Coalescing window (ms): revalidate at most once per this span. */
const REVALIDATE_THROTTLE_MS = 1000;

export function useSidebarRevalidation(revalidate: () => void): void {
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        revalidateRef.current();
      }, REVALIDATE_THROTTLE_MS);
    };
    window.addEventListener('omp:session-updated', schedule);
    return () => {
      window.removeEventListener('omp:session-updated', schedule);
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, []);
}
