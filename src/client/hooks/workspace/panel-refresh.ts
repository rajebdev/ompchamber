import { useEffect, useRef } from 'preact/hooks';
import { FILE_MUTATION_EVENT } from '@/shared/lib/chat/omp/file-mutations';
import { useVisibilityRefresh } from '@/client/hooks/ui/visibility-refresh';
import {
  FILE_MUTATION_THROTTLE_MS,
  PANEL_REFRESH_MS,
} from '@/shared/lib/workspace/refresh-cadence';

/**
 * Re-invokes `callback` every `intervalMs` while `enabled`. The latest
 * callback is read through a ref, so a panel can pass a non-memoized closure
 * without the interval being torn down and restarted on every render.
 *
 * Deliberately does not run the callback on mount: each panel already loads
 * once from its own mount effect, and re-running here would double-fetch.
 *
 * A tick is skipped while the previous invocation is still running. Some
 * panels do genuinely slow work — a `grep -r` over a multi-GB workspace can
 * take tens of seconds — and the panel's fetcher aborts its previous request
 * whenever a new one starts, so an unguarded tick would cancel every search
 * before it could finish and the panel would sit on "Searching..." forever.
 *
 * Polling also pauses while the document is hidden (background tab, mobile
 * screen lock): a hidden page cannot render the results, so each tick would
 * be wasted work — and on mobile it keeps waking the CPU. A visibilitychange
 * back to visible immediately re-reads, so the panel is never stale when the
 * user returns.
 */
export function usePanelRefresh(
  callback: () => void | Promise<unknown>,
  enabled: boolean,
  intervalMs: number = PANEL_REFRESH_MS,
) {
  useVisibilityRefresh(callback, { enabled, intervalMs, guardInFlight: true });
}

/**
 * Event-driven companion to `usePanelRefresh`: re-invokes `callback` shortly
 * after `omp:files-mutated` fires — the chat fold dispatches it when a
 * file-mutating tool (edit / write / ast_edit / bash) completes. Panels keep
 * their poll as the belt; this just removes the up-to-5s staleness after an
 * AI edit. Same in-flight guard and visibility pause as the poll. Throttled
 * because a bash that touches many files still ends once, but a burst of
 * quick tool calls should collapse to one re-read.
 */
export function useFileMutationRefresh(
  callback: () => void | Promise<unknown>,
  enabled: boolean,
  throttleMs: number = FILE_MUTATION_THROTTLE_MS,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void cbRef.current();
        }
      }, throttleMs);
    };
    window.addEventListener(FILE_MUTATION_EVENT, schedule);
    return () => {
      window.removeEventListener(FILE_MUTATION_EVENT, schedule);
      clearTimeout(timer);
    };
  }, [enabled, throttleMs]);
}
