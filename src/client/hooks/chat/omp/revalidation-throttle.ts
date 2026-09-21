/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Throttled revalidation for the session sidebars.
 *
 * `omp:session-updated` arrives in bursts while a run is active (agent start,
 * first completed assistant turn, JSONL write, spawn adoption, agent end) — and
 * the chat timeline's metadata retry loop can emit one every 250ms until the
 * session file carries the user turn. Each dispatch would otherwise trigger a
 * full loader revalidation, and with two sidebars mounted (desktop + mobile
 * layouts keep theirs alive) a busy run could revalidate several times per
 * second.
 *
 * Implemented as a LEADING + TRAILING throttle, not a trailing debounce:
 *
 *   - the first event of a quiet period revalidates IMMEDIATELY, so a spawn or
 *     title change lands without the ~1s lag a pure debounce would add;
 *   - further events inside the window collapse into a single trailing call.
 *
 * The leading edge is what makes this safe under a sustained burst. A trailing
 * debounce resets its timer on every event, so a steady 250ms stream would push
 * the revalidation out forever and the sidebar would go stale for the whole
 * spawn — the exact case this hook exists to cover.
 */

import { useEffect, useRef } from 'preact/hooks';
import { SIDEBAR_REVALIDATE_THROTTLE_MS } from '@/shared/lib/workspace/refresh-cadence';

export function useSidebarRevalidation(revalidate: () => void): void {
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Timestamp of the last revalidation, so the leading edge can be decided
  // synchronously inside the event handler.
  const lastFiredRef = useRef(0);

  useEffect(() => {
    const fire = () => {
      lastFiredRef.current = Date.now();
      revalidateRef.current();
    };

    const schedule = () => {
      const elapsed = Date.now() - lastFiredRef.current;
      if (elapsed >= SIDEBAR_REVALIDATE_THROTTLE_MS) {
        // Leading edge: nothing recent, so refresh now.
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
        fire();
        return;
      }
      // Inside the window: collapse the burst into one trailing call.
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        fire();
      }, SIDEBAR_REVALIDATE_THROTTLE_MS - elapsed);
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
