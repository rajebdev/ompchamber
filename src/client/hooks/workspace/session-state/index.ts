import { useEffect, useRef, useState } from 'preact/hooks';
import { getSessionValue, hydrateSession, setSessionKey } from '@/shared/lib/workspace/session-state/store';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';

type LoadedState = Record<string, unknown>;

/**
 * Per-session persisted state slot. Restores `fallback` until the session's
 * blob is loaded, then swaps in the stored value; every write is cached and
 * debounced-persisted under the active session id.
 *
 * Returns `[value, setValue, ready]` — `ready` lets panels defer their first
 * fetch/render until restore completed (mirrors the DesktopLayout editor
 * "blip" concern).
 */
export function useSessionState<T>(key: string, fallback: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const { sessionId, ready } = useSessionStateContext();
  const stored = getSessionValue<T>(sessionId, key);
  const [local, setLocal] = useState<T>(stored === undefined ? fallback : stored);
  const sessionIdRef = useRef(sessionId);

  // Restore the stored value (or reset to fallback) on session change/load.
  useEffect(() => {
    if (sessionIdRef.current !== sessionId) {
      sessionIdRef.current = sessionId;
    }
    if (!ready) return;
    const next = getSessionValue<T>(sessionId, key);
    setLocal(next === undefined ? fallback : next);
    // `key` and `fallback` are stable per call site; session/ready drive restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ready, key]);

  const setValue = (value: T | ((prev: T) => T)) => {
    const resolved = typeof value === 'function' ? (value as (prev: T) => T)(getSessionValue<T>(sessionId, key) ?? local) : value;
    setLocal(resolved);
    setSessionKey(sessionId, key, resolved);
  };

  // While the blob loads, surface the live in-memory value so a panel never
  // renders stale fallback over a fresher local write.
  if (!ready && stored !== undefined && stored !== local) {
    return [stored, setValue, ready];
  }
  return [local, setValue, ready];
}

export const useSessionUiState = useSessionState;

/** One-shot restore helper for non-hook contexts (event handlers, stores). */
export function useSessionStateSnapshot(): { sessionId: string; ready: boolean; read: <T>(key: string, fallback: T) => T; hydrate: (state: LoadedState) => void } {
  const { sessionId, ready } = useSessionStateContext();
  return {
    sessionId,
    ready,
    read: <T,>(key: string, fallback: T): T => {
      const stored = getSessionValue<T>(sessionId, key);
      return stored === undefined ? fallback : stored;
    },
    hydrate: (state: LoadedState) => hydrateSession(sessionId, state),
  };
}
