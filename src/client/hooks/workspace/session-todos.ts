/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads a session's live todo list for the right-panel view.
 *
 * The list belongs to omp and its only durable home is the session transcript,
 * so this hook is a reader: it fetches `GET /api/omp/session-todos` and re-reads
 * on two triggers —
 *
 *   - a poll (`usePanelRefresh`, paused while hidden), which covers a list the
 *     agent changed while this client was not the one driving it;
 *   - `omp:session-updated`, which the chat dispatches at every turn boundary
 *     and therefore right after each `todo` tool call, so the panel follows a
 *     running agent without waiting out the poll.
 *
 * The event path is throttled: one run emits the signal several times around a
 * single tool call, and the read is a disk parse. A read already in flight is
 * not cancelled by a newer trigger — the server answers an unchanged session
 * from a stat, so the extra request is cheap, and dropping the newer one would
 * leave the panel showing the list from before the call that just finished.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import { TODO_REFRESH_EVENT_THROTTLE_MS } from '@/shared/lib/workspace/refresh-cadence';
import type { SessionTodosPayload } from '@/shared/types/todo';

export interface SessionTodosState {
  data: SessionTodosPayload | null;
  isLoading: boolean;
  /** Set when the last read failed; the previous payload is kept meanwhile. */
  error: string | null;
  reload: () => void;
}

export function useSessionTodos(sessionId: string | null, enabled: boolean): SessionTodosState {
  const [data, setData] = useState<SessionTodosPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest session id for the fetcher, so switching sessions does not have to
  // rebuild the callback (and with it the poll interval) on every render.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Guards against a response for a session the user has already left being
  // written into the panel that now shows a different one.
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const id = sessionIdRef.current;
    if (!id) {
      setData(null);
      return;
    }
    const request = ++requestRef.current;
    setIsLoading(true);
    fetch(`/api/omp/session-todos?sessionId=${encodeURIComponent(id)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Todo request failed (${response.status})`);
        return response.json() as Promise<SessionTodosPayload>;
      })
      .then((payload) => {
        if (requestRef.current !== request) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestRef.current !== request) return;
        setError(err instanceof Error ? err.message : 'Failed to load todos');
      })
      .finally(() => {
        if (requestRef.current === request) setIsLoading(false);
      });
  }, []);

  // A session switch must not render the previous session's list under the new
  // title: drop the payload and re-read immediately.
  useEffect(() => {
    setData(null);
    setError(null);
    if (sessionId) load();
  }, [sessionId, load]);

  usePanelRefresh(load, enabled);

  const throttleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useChamberEvent('omp:session-updated', () => {
    if (!enabled || throttleRef.current !== undefined) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = undefined;
      load();
    }, TODO_REFRESH_EVENT_THROTTLE_MS);
  });

  useEffect(() => () => clearTimeout(throttleRef.current), []);

  return { data, isLoading, error, reload: load };
}
