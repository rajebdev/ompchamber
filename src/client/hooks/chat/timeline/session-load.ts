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
 * normally; the stream resume continues from there. Clobbering is only possible
 * while an optimistic AI placeholder actually owns the tail of the timeline.
 */

import type { Dispatch, RefObject, SetStateAction } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import type { ChatMessageData } from '@/shared/types';
import { normalizeNoticePositions } from '@/shared/lib/chat/order';
import { SESSION_META_RETRY_SCHEDULE_MS } from '@/shared/lib/workspace/refresh-cadence';

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
  /** Live generating flag written by the caller's `setGenerating` throat. Gates
   *  the committed-fetch clobber guard and the seeded-model fallback. */
  isGeneratingRef: { current: boolean };
  /** Live AI placeholder ref: when non-null it owns the timeline tail and the
   *  committed fetch must not replace it mid-stream. */
  aiPlaceholderIdRef: { current: string | null };
  /** Caller-owned timeline state mirror: lets the committed fetch merge the
   *  live stream tail (rows the JSONL does not carry yet) into history. */
  localMessagesRef: { current: ChatMessageData[] };
  /** Live optimistic user bubble ref: cleared together with the placeholder on
   *  a session switch so stale ids cannot survive into the next session. */
  optimisticUserIdRef: { current: string | null };
  /** Drop queued stream updates belonging to the previous session (coalescer). */
  cancelStreamingCoalescer: () => void;
  metaRefreshedRef: { current: string | null };
  /** Scroll container of the timeline: lets loadOlder preserve the viewport
   *  position when older rows are prepended above it. */
  scrollRef?: RefObject<HTMLDivElement>;
}

export function useSessionLoad(deps: UseSessionLoadDeps) {
  const { sessionId, setLocalMessages, setGenerating, isGeneratingRef, aiPlaceholderIdRef, localMessagesRef, optimisticUserIdRef, cancelStreamingCoalescer, metaRefreshedRef, scrollRef } = deps;

  const [sessionData, setSessionData] = useState<SessionDataShape | null>(null);
  // History pagination state: the first fetch receives the newest window only;
  // scrolling to the top pages further back via ?before=oldestIndex.
  const [hasMore, setHasMore] = useState(false);
  const [oldestIndex, setOldestIndex] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Sticky failure flag for the "Load earlier messages" affordance: a failed
  // page fetch must keep the button visible (retryable) instead of silently
  // dropping hasMore, which made the button vanish with no feedback.
  const [loadOlderError, setLoadOlderError] = useState(false);
  // Bumped on every successful older-window prepend; the scroll-anchor layout
  // effect keys on it (its other deps have stable identities, so it needs an
  // explicit change signal per commit).
  const [prependTick, setPrependTick] = useState(0);
  const loadingOlderRef = useRef(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  // Set while prepending older rows; the layout effect below re-anchors the
  // viewport to the content the user was reading instead of jumping.
  const pendingScrollAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
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
   *  real session title instead of the default. Retries on a front-loaded
   *  backoff until the JSONL actually carries messages (omp writes the user
   *  turn on agent start). */
  const refreshSessionMeta = useCallback((sid: string) => {
    // The URL lags the adopted id right after a fresh spawn, so accept either.
    const isActive = () => sessionIdRef.current === sid || adoptedSessionIdRef.current === sid;
    if (!isActive()) return;
    let attempt = 0;
    const tryFetch = () => {
      if (!isActive()) return;
      fetch(`/api/chat/${encodeURIComponent(sid)}`)
        .then(res => res.json())
        .then(data => {
          if (!data?.session || !isActive()) return;
          applySessionData(data.session);
          // Signal the sidebar only on a settled read: the early attempts of a
          // fresh spawn see zero messages, and dispatching on those would reset
          // the sidebar's throttle window for the whole spawn.
          if ((data.session.messages?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
            return;
          }
          const delay = SESSION_META_RETRY_SCHEDULE_MS[attempt];
          attempt += 1;
          if (delay !== undefined) setTimeout(tryFetch, delay);
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
    setSessionLoading(true);
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
        seededModelRef.current = null;
        // The placeholder/optimistic ids belong to the PREVIOUS session's
        // in-flight send; message_end never arrives after a switch away (the
        // stream is disconnected), so they must be dropped here. A stale
        // placeholder made timelineOwnedByOptimistic() report true on return,
        // which silently DISCARDED the committed history fetch of the
        // mid-run session — only newly streamed frames ever appeared.
        aiPlaceholderIdRef.current = null;
        optimisticUserIdRef.current = null;
        // Drop coalesced message_update frames queued by the previous
        // session's stream: otherwise they apply to this (cleared) timeline
        // as phantom bubbles.
        cancelStreamingCoalescer();
      }
      // Reset pagination cursor on every session switch — the window belongs
      // to the previous session otherwise.
      setHasMore(false);
      setOldestIndex(0);
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      setLoadOlderError(false);
      // metaRefreshedRef must NOT survive a session switch — including a
      // spawn adoption. It is the once-per-session guard in onAgentStart
      // (omp-callbacks.ts); keeping the stale value here ate the retrigger,
      // so a title refresh that landed before the omp JSONL had messages
      // (default timestamped title) never ran again and the sidebar stayed
      // on the placeholder until some later event refreshed it.
      metaRefreshedRef.current = null;
      prevSessionIdRef.current = sessionId;
    }
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          setSessionLoading(false);
          if (data?.session) {
            applySessionData(data.session);
            // Only replace the timeline when the fetch actually has messages.
            // A pending "new-…" session or a just-spawned omp session whose
            // JSONL is not written yet must not wipe the optimistic bubbles.
            const fetched = data.session.messages || [];
            const optimisticOwnsTail = timelineOwnedByOptimistic();
            if (fetched.length > 0 && !optimisticOwnsTail) {
              // Reattach race: a resumed stream may have appended the
              // in-flight segment before this committed fetch resolved (the
              // JSONL does not carry it yet). Keep those live rows instead of
              // dropping them until the next message_update re-renders them.
              if (isGeneratingRef.current) {
                const fetchedIds = fetched.map((m: ChatMessageData) => m.id);
                const liveTail = localMessagesRef.current.filter(m => !fetchedIds.includes(m.id));
                setLocalMessages(normalizeNoticePositions([...fetched, ...liveTail]));
              } else {
                setLocalMessages(normalizeNoticePositions(fetched));
              }
            } else if (!sessionId.startsWith('new-') && !optimisticOwnsTail) {
              setLocalMessages([]);
            }
            if (typeof data.hasMore === 'boolean') setHasMore(data.hasMore);
            if (typeof data.oldestIndex === 'number') setOldestIndex(data.oldestIndex);
          } else {
            setSessionData(null);
            if (!timelineOwnedByOptimistic()) setLocalMessages([]);
          }
        })
        .catch(err => {
          console.error('Error loading session from API:', err);
          if (active) setSessionLoading(false);
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

  /** Page the next older window into the timeline. Called from the click
   *  handler and the scroll handler when the viewport reaches the top; a no-op
   *  while a page is in flight, when the session has no more history, or while
   *  the session is a pending optimistic spawn. Prepending older rows only
   *  grows the list ABOVE the tail, so it is safe while the agent is
   *  generating — unlike a committed refetch, it never clobbers the AI
   *  placeholder, and blocking it made the button feel dead mid-run. */
  const loadOlder = useCallback(() => {
    if (!sessionId || sessionId.startsWith('new-')) return;
    if (!hasMore || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(false);
    const el = scrollRef?.current;
    if (el) pendingScrollAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
    // Session id snapshot: prepending a window fetched for the PREVIOUS
    // session into the freshly-switched timeline is worse than dropping the
    // page, so the response is discarded if the user switched mid-flight.
    const requestedSessionId = sessionId;
    fetch(`/api/chat/${sessionId}?before=${oldestIndex}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { session?: { messages?: ChatMessageData[] }; hasMore?: boolean; oldestIndex?: number }) => {
        // The main load effect may have cleared/repurposed localMessages for a
        // new session while this fetch was in flight.
        if (sessionIdRef.current !== requestedSessionId) return;
        const older = data.session?.messages ?? [];
        setHasMore(Boolean(data.hasMore));
        if (typeof data.oldestIndex === 'number') setOldestIndex(data.oldestIndex);
        if (older.length === 0) {
          // No rows prepended: the recorded anchor is stale — drop it so a
          // later tick cannot apply it against the wrong geometry.
          pendingScrollAnchorRef.current = null;
          return;
        }
        setLocalMessages(prev => {
          // Drop overlap guard: the server window is index-based, so the
          // fetched slice is strictly older than everything already mounted.
          return [...normalizeNoticePositions(older), ...prev];
        });
        // Bump the prepend tick so the layout effect below re-runs for THIS
        // commit — it previously depended only on stable identities and ran
        // exactly once at mount, so the viewport anchor never fired and every
        // pagination jump snapped the user to the (shifted) top.
        setPrependTick(t => t + 1);
      })
      .catch(() => {
        // Keep the button mounted and marked for retry; a swallowed failure
        // previously also cleared hasMore on the next full reload path.
        if (sessionIdRef.current === requestedSessionId) setLoadOlderError(true);
      })
      .finally(() => {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      });
  }, [sessionId, hasMore, oldestIndex, scrollRef, setLocalMessages]);

  // Position preservation: after older rows commit above the viewport, shift
  // scrollTop by the height delta so the rows the user was reading stay put.
  // prependTick changes on every prepend — without it the effect ran only at
  // mount (its other deps are stable) and never re-anchored.
  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor) return;
    const el = scrollRef?.current;
    if (!el) return;
    pendingScrollAnchorRef.current = null;
    const delta = el.scrollHeight - anchor.prevHeight;
    if (delta > 0) el.scrollTop = anchor.prevTop + delta;
  }, [prependTick, scrollRef]);

  return {
    sessionData,
    hasMore,
    loadingOlder,
    loadOlderError,
    sessionLoading,
    loadOlder,
    adoptedSessionIdRef,
    seededModelRef,
    applySessionData,
    refreshSessionMeta,
    setSessionModel: setSessionModelWithSeed,
    timelineOwnedByOptimistic,
  };
}
