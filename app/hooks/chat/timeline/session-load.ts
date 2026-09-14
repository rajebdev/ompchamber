/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session loading core for the chamber chat: fetches /api/chat/:sessionId,
 * applies session metadata (model / thinking level / title) and replaces the
 * timeline with the committed messages. Extracted from useChatTimeline so that
 * hook stays under the size ceiling.
 *
 * Reload-mid-stream contract: the timeline fetch must NOT depend on the
 * generating flag alone. On a page reload during a run there is no optimistic
 * bubble yet (fresh mount, refs are null), so the committed JSONL history —
 * including the already-finalized turns of the in-flight run — must load
 * normally; the SSE resume continues from there. Clobbering is only possible
 * while an optimistic AI placeholder actually owns the tail of the timeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageData } from '@/types';
import { normalizeNoticePositions } from '@/lib/chat/order';

export interface SessionDataShape {
  id?: string;
  title?: string;
  model?: string | { provider: string; modelId: string };
  thinkingLevel?: string;
  messages?: any[];
}

export interface UseSessionLoadDeps {
  sessionId: string | null;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  setGenerating: (v: boolean) => void;
  /** Live AI placeholder ref: when non-null it owns the timeline tail and the
   *  committed fetch must not replace it mid-stream. */
  aiPlaceholderIdRef: { current: string | null };
  metaRefreshedRef: { current: string | null };
}

export function useSessionLoad(deps: UseSessionLoadDeps) {
  const { sessionId, setLocalMessages, setGenerating, aiPlaceholderIdRef, metaRefreshedRef } = deps;

  const [sessionData, setSessionData] = useState<SessionDataShape | null>(null);
  const isGeneratingRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);
  // Real session id adopted by a fresh spawn ("new-…" → UUID). onAgentStart
  // may fire before React re-renders with the new URL, so it reads the id
  // from here instead of the (still-stale) sessionId prop.
  const adoptedSessionIdRef = useRef<string | null>(null);
  // Model seeded from the spawn response; kept until the JSONL writes model_change.
  const seededModelRef = useRef<{ provider: string; modelId: string } | null>(null);

  const applySessionData = useCallback((incoming: SessionDataShape) => {
    if (incoming.model && typeof incoming.model === 'object') seededModelRef.current = incoming.model;
    const model = incoming.model ?? (isGeneratingRef.current ? seededModelRef.current ?? undefined : undefined);
    setSessionData({ ...incoming, model });
  }, []);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /** Re-fetch the session's title/metadata after the omp JSONL has been
   *  written (spawn or agent end) so the navbar and context panel show the
   *  real session title instead of the default. Retries (fast) until the JSONL
   *  actually carries messages (omp writes the user turn on agent start), so
   *  the sidebar refresh lands as soon as the first chunk arrives. */
  const refreshSessionMeta = useCallback((sid: string) => {
    // The URL lags the adopted id right after a fresh spawn, so accept either.
    const isActive = () => sessionIdRef.current === sid || adoptedSessionIdRef.current === sid;
    if (!isActive()) return;
    let attempts = 0;
    const tryFetch = () => {
      if (!isActive()) return;
      attempts += 1;
      fetch(`/api/chat/${encodeURIComponent(sid)}`)
        .then(res => res.json())
        .then(data => {
          if (!data?.session || !isActive()) return;
          applySessionData(data.session);
          // Only signal the sidebar once the JSONL carries the user turn, so
          // the item appears with its real title (not the default).
          if ((data.session.messages?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
          } else if (attempts < 40) {
            // The omp JSONL may be written well after agent_start: keep
            // polling (20s) until the user turn lands so the sidebar item
            // appears as soon as the chunk arrives.
            setTimeout(tryFetch, 500);
          }
        })
        .catch(() => {});
    };
    tryFetch();
  }, [applySessionData]);

  const setSessionModelWithSeed = useCallback((model: { provider: string; modelId: string } | null) => {
    seededModelRef.current = model;
    setSessionData(prev => ({ ...(prev ?? {}), model: model ?? undefined }));
  }, []);

  /** Whether the optimistic bubble set currently owns the timeline tail (a
   *  local send is in flight). Only then must a committed fetch be skipped —
   *  a bare mount (reload mid-run) has isGenerating false AND no placeholder,
   *  so committed history still loads. */
  const timelineOwnedByOptimistic = useCallback(
    () => isGeneratingRef.current && Boolean(aiPlaceholderIdRef.current),
    [aiPlaceholderIdRef],
  );

  // Fetch session messages and details from API
  useEffect(() => {
    let active = true;
    // Track the previous session id so a session switch (including "New
    // Session" → new-…) clears the timeline, while the optimistic spawn
    // transition (new-… → real UUID) keeps its bubbles.
    if (sessionId !== prevSessionIdRef.current) {
      const isSpawnAdopt = sessionId && !sessionId.startsWith('new-') && prevSessionIdRef.current?.startsWith('new-');
      // Keep the optimistic bubbles while a local send is in flight and this
      // session is the one it spawned (a fresh spawn may not have passed
      // through "new-…"). A reload mid-run has no adopted id, so history loads.
      const isAdoptingInFlight = isGeneratingRef.current && adoptedSessionIdRef.current === sessionId;
      if (!isSpawnAdopt && !isAdoptingInFlight) {
        setLocalMessages([]);
        setGenerating(false);
        adoptedSessionIdRef.current = null;
        metaRefreshedRef.current = null;
        seededModelRef.current = null;
      }
      prevSessionIdRef.current = sessionId;
    }
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          if (data?.session) {
            applySessionData(data.session);
            // Only replace the timeline when the fetch actually has messages.
            // A pending "new-…" session or a just-spawned omp session whose
            // JSONL is not written yet must not wipe the optimistic bubbles.
            const fetched = data.session.messages || [];
            const optimisticOwnsTail = timelineOwnedByOptimistic();
            if (fetched.length > 0 && !optimisticOwnsTail) {
              setLocalMessages(normalizeNoticePositions(fetched));
            } else if (!sessionId.startsWith('new-') && !optimisticOwnsTail) {
              setLocalMessages([]);
            }
          } else {
            setSessionData(null);
            if (!timelineOwnedByOptimistic()) setLocalMessages([]);
          }
        })
        .catch(err => {
          console.error('Error loading session from API:', err);
          if (active && !timelineOwnedByOptimistic()) {
            setSessionData(null);
            setLocalMessages([]);
          }
        });
    } else {
      setSessionData(null);
      setLocalMessages([]);
    }
    return () => {
      active = false;
    };
    // sessionModel identity flows through applySessionData; the effect only
    // re-runs on session switches by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, applySessionData, timelineOwnedByOptimistic, setLocalMessages, setGenerating]);

  return {
    sessionData,
    isGeneratingRef,
    adoptedSessionIdRef,
    seededModelRef,
    applySessionData,
    refreshSessionMeta,
    setSessionModel: setSessionModelWithSeed,
    timelineOwnedByOptimistic,
  };
}
