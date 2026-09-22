/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Older-window pagination for the chamber timeline: pages
 * `/api/chat/:id?before=` into the head of the message list and keeps the
 * viewport anchored on the rows the user was reading. Extracted from
 * useSessionLoad so that hook stays under the repo's per-file size ceiling.
 */

import type { Dispatch, RefObject, SetStateAction } from 'preact/compat';
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ChatMessageData } from '@/shared/types';

export interface UseSessionPaginationDeps {
  sessionId: string | null;
  /** Live session id, read when the page response lands: a window fetched for
   *  the previous session is worse than a dropped page. */
  sessionIdRef: { current: string | null };
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  /** Scroll container of the timeline: lets loadOlder preserve the viewport
   *  position when older rows are prepended above it. */
  scrollRef?: RefObject<HTMLDivElement>;
}

export interface SessionPagination {
  hasMore: boolean;
  loadingOlder: boolean;
  /** Sticky failure flag for the "Load earlier messages" affordance: a failed
   *  page fetch must keep the button visible (retryable) instead of silently
   *  dropping hasMore, which made the button vanish with no feedback. */
  loadOlderError: boolean;
  loadOlder: () => void;
  /** Forget the cursor and the retry flag — a window belongs to one session. */
  resetPages: () => void;
  /** Adopt the window metadata a session load returned. */
  applyWindow: (hasMore: unknown, oldestIndex: unknown) => void;
}

export function useSessionPagination(deps: UseSessionPaginationDeps): SessionPagination {
  const { sessionId, sessionIdRef, setLocalMessages, scrollRef } = deps;

  const [hasMore, setHasMore] = useState(false);
  const [oldestIndex, setOldestIndex] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState(false);
  // Bumped on every successful older-window prepend; the scroll-anchor layout
  // effect keys on it (its other deps have stable identities, so it needs an
  // explicit change signal per commit).
  const [prependTick, setPrependTick] = useState(0);
  const loadingOlderRef = useRef(false);
  // Set while prepending older rows; the layout effect below re-anchors the
  // viewport to the content the user was reading instead of jumping.
  const pendingScrollAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);

  const resetPages = useCallback(() => {
    setHasMore(false);
    setOldestIndex(0);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setLoadOlderError(false);
  }, []);

  const applyWindow = useCallback((hasMoreFromLoad: unknown, oldestIndexFromLoad: unknown) => {
    if (typeof hasMoreFromLoad === 'boolean') setHasMore(hasMoreFromLoad);
    if (typeof oldestIndexFromLoad === 'number') setOldestIndex(oldestIndexFromLoad);
  }, []);

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
        applyWindow(data.hasMore, data.oldestIndex);
        if (older.length === 0) {
          // No rows prepended: the recorded anchor is stale — drop it so a
          // later tick cannot apply it against the wrong geometry.
          pendingScrollAnchorRef.current = null;
          return;
        }
        setLocalMessages(prev => {
          // Drop overlap guard: the server window is index-based, so the
          // fetched slice is strictly older than everything already mounted.
          return [...older, ...prev];
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
  }, [sessionId, sessionIdRef, hasMore, oldestIndex, scrollRef, setLocalMessages, applyWindow]);

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

  return { hasMore, loadingOlder, loadOlderError, loadOlder, resetPages, applyWindow };
}
