import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  loadSession,
  markSessionReady,
  flushSession,
  migrateSessionState,
} from '@/lib/workspace/session-state/store';
import { SessionStateContext } from '@/hooks/workspace/session-state/context';

/**
 * Mounts once above the workspace panels and drives the per-session UI state
 * lifecycle: load the stored blob when the session changes, flush pending
 * writes before switching, and migrate a pending `new-…` chat's state onto
 * the real id adopted by a spawn. Consumers read/write through
 * `useSessionState(key, fallback)`.
 */
export function SessionStateProvider({ sessionId, children }: { sessionId: string | null; children: ReactNode }) {
  const effectiveSessionId = sessionId || '1';
  const [ready, setReady] = useState(false);
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = effectiveSessionId;
    if (prev === effectiveSessionId) return;

    // Spawn adoption ("new-…" → real UUID): carry the pending state over
    // instead of loading (nothing is stored under the real id yet).
    if (prev && prev.startsWith('new-') && !effectiveSessionId.startsWith('new-')) {
      migrateSessionState(prev, effectiveSessionId);
      setReady(true);
      return;
    }

    if (effectiveSessionId.startsWith('new-')) {
      // Fresh pending chat: nothing stored yet; ready immediately so the
      // composer starts empty instead of waiting on a fetch.
      markSessionReady(effectiveSessionId);
      setReady(true);
      return;
    }

    setReady(false);
    void flushSession(prev).then(() => loadSession(effectiveSessionId)).then(() => {
      // The session may have switched again while loading; only surface readiness.
      if (prevSessionIdRef.current === effectiveSessionId) setReady(true);
    });
  }, [effectiveSessionId]);

  const value = useMemo(
    () => ({ sessionId: effectiveSessionId, ready }),
    [effectiveSessionId, ready],
  );

  return <SessionStateContext.Provider value={value}>{children}</SessionStateContext.Provider>;
}
