import { useEffect, useRef } from 'react';

/**
 * Cadence (ms) the data-bearing right panels re-read their source at. Panels
 * are mounted only while active, so polling only ever runs for the open panel
 * (chat is exempt — it is live via the agent stream, not polling).
 */
export const PANEL_REFRESH_MS = 2000;

/**
 * Re-invokes `callback` every `intervalMs` while `enabled`. The latest
 * callback is read through a ref, so a panel can pass a non-memoized closure
 * without the interval being torn down and restarted on every render.
 *
 * Deliberately does not run the callback on mount: each panel already loads
 * once from its own mount effect, and re-running here would double-fetch.
 */
export function usePanelRefresh(callback: () => void, enabled: boolean, intervalMs: number = PANEL_REFRESH_MS) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => cbRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
