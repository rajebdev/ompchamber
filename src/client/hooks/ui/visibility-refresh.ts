import { useEffect, useRef } from 'preact/hooks';

export interface VisibilityRefreshOptions {
  /** When false, no interval or listener is bound. */
  enabled: boolean;
  /** Poll cadence in ms; a non-positive value disables polling. */
  intervalMs: number;
  /**
   * When true, a tick is skipped while the previous async callback is still
   * running (the callback owns its error surface, so both arms release the
   * lock). Off by default so a plain synchronous poller is never gated.
   */
  guardInFlight?: boolean;
}

/**
 * Re-invokes `callback` every `intervalMs` while `enabled`, pausing while the
 * document is hidden and re-reading once on the transition back to visible.
 *
 * Deliberately does not run the callback on mount: callers that need an initial
 * load run it from their own mount effect. The latest callback is read through
 * a ref, so a non-memoized closure does not restart the interval on every
 * render.
 */
export function useVisibilityRefresh(
  callback: () => void | Promise<unknown>,
  { enabled, intervalMs, guardInFlight = false }: VisibilityRefreshOptions,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    let inFlight = false;

    const invoke = () => {
      if (!guardInFlight) {
        void cbRef.current();
        return;
      }
      if (inFlight) return;
      const result = cbRef.current();
      if (!result || typeof (result as Promise<unknown>).then !== 'function') return;
      inFlight = true;
      const release = () => {
        inFlight = false;
      };
      Promise.resolve(result).then(release, release);
    };

    const id = setInterval(() => {
      if (visible) invoke();
    }, intervalMs);
    const onVisibility = () => {
      const next = document.visibilityState === 'visible';
      if (next && !visible) invoke();
      visible = next;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, guardInFlight]);
}
