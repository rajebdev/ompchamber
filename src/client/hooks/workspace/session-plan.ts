/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads a session's plan-mode artifacts for the right-panel Plan view.
 *
 * The plan is omp's file, so this hook is a reader: it fetches
 * `GET /api/omp/session-plan` and re-reads on three triggers —
 *
 *   - a poll (`usePanelRefresh`, paused while hidden), which covers a plan the
 *     agent rewrote while this client was not the one driving it;
 *   - `omp:session-updated`, which the chat dispatches at every turn boundary,
 *     so the panel follows a running agent without waiting out the poll;
 *   - a plan switch in the panel itself, which re-reads with `?path=`.
 *
 * The event path is throttled for the same reason the todo reader's is: one run
 * emits the signal several times around a single tool call, and each read is a
 * directory listing plus a file read.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import { PLAN_REFRESH_EVENT_THROTTLE_MS } from '@/shared/lib/workspace/refresh-cadence';
import type { SessionPlanPayload } from '@/shared/types/plan';

export interface SessionPlanState {
  data: SessionPlanPayload | null;
  isLoading: boolean;
  /** Set when the last read failed; the previous payload is kept meanwhile. */
  error: string | null;
  reload: () => void;
}

/**
 * @param selected  A `local://<slug>-plan.md` the user picked in the panel.
 *   Sent as `?path=` so the server serves that artifact rather than the
 *   session's current one — the server still validates the name.
 */
export function useSessionPlan(sessionId: string | null, enabled: boolean, selected?: string | null): SessionPlanState {
  const [data, setData] = useState<SessionPlanPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest values for the fetcher, so a session or plan switch does not rebuild
  // the callback (and with it the poll interval) on every render.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Guards against a response for a session or plan the user has already left
  // being written into the panel that now shows another.
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const current = sessionIdRef.current;
    if (!current) {
      setData(null);
      setError(null);
      return Promise.resolve();
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setIsLoading(true);
    const query = new URLSearchParams({ sessionId: current });
    if (selectedRef.current) query.set('path', selectedRef.current);
    return fetch(`/api/omp/session-plan?${query.toString()}`)
      .then(async (response) => {
        if (request !== requestRef.current) return;
        if (!response.ok) {
          setError(`Could not read the plan (HTTP ${response.status})`);
          return;
        }
        const payload = (await response.json()) as SessionPlanPayload;
        if (request !== requestRef.current) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (request !== requestRef.current) return;
        setError(err instanceof Error ? err.message : 'Could not read the plan');
      })
      .finally(() => {
        if (request === requestRef.current) setIsLoading(false);
      });
  }, []);

  // A session switch must not render the previous session's plan under the new
  // title: drop the payload and re-read immediately.
  useEffect(() => {
    setData(null);
    setError(null);
    void load();
  }, [sessionId, load]);

  // A plan switch inside the panel re-reads at once; the poll would otherwise
  // leave the previous plan on screen for up to its interval.
  useEffect(() => {
    if (selected === undefined) return;
    void load();
  }, [selected, load]);

  usePanelRefresh(load, enabled);

  const throttleRef = useRef<number | undefined>(undefined);
  useChamberEvent('omp:session-updated', () => {
    if (!enabled) return;
    clearTimeout(throttleRef.current);
    throttleRef.current = window.setTimeout(() => void load(), PLAN_REFRESH_EVENT_THROTTLE_MS);
  });

  useEffect(() => () => clearTimeout(throttleRef.current), []);

  return { data, isLoading, error, reload: load };
}
