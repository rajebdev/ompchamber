/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side session-list fetcher. Owns the single `useFetcher` against
 * `GET /api/sessions/list` and exposes it through a React context so every
 * consumer (desktop sidebar, mobile sidebar, chat timeline, layout headers)
 * shares one in-flight request and one `folders` snapshot.
 *
 * Refresh contract: the throttled stream-event hook, the 5s stream poll, the
 * status-ack hook, and per-item mutations all call `refresh()` — a plain
 * `fetcher.load` that no longer revalidates the whole document route.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createContext } from 'preact/compat';
import type { ReactNode } from 'preact/compat';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { WorkspaceFolderData } from '@/shared/types';
import type { SidebarData } from '@/server/lib/omp/session/sidebar-data.server';

export interface SidebarDataHandle {
  folders: WorkspaceFolderData[];
  isMock: boolean;
  /** True only before the FIRST successful load — drives the skeleton. */
  initializing: boolean;
  /** Fire a refresh (dedup: while a load is in flight this is a no-op). */
  refresh: () => void;
  /**
   * Mark a session's one-shot terminal badge as seen NOW: strips the check
   * optimistically for this mount and POSTs the server ack. No-op unless the
   * session currently carries a terminal (`finish`/`abort`/`error`) status.
   */
  markSeen: (sessionId: number | string) => void;
  /** True when markSeen already ran for this session on this mount. */
  hasSeen: (sessionId: number | string) => boolean;
}

const SidebarDataContext = createContext<SidebarDataHandle | null>(null);

export function SidebarDataProvider({ children, initialFolders = [] }: { children: ReactNode; initialFolders?: WorkspaceFolderData[] }) {
  const fetcher = useFetcher<SidebarData>();
  const [hasLoaded, setHasLoaded] = useState(false);
  const firstLoadRef = useRef(false);
  // Session ids whose badge the user has already dismissed on this mount.
  // Optimistic strip: keeps the click→disappearance instant and stops the
  // pending ack effect in useSessionStatusAck from double-POSTing.
  const seenRef = useRef<Set<string>>(new Set());

  // Kick the first fetch on mount; the SSR document no longer carries folders.
  useEffect(() => {
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;
    void fetcher.load('/api/sessions/list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fetcher.data) setHasLoaded(true);
  }, [fetcher.data]);

  const refresh = useMemo(() => {
    return () => {
      // Serialize loads: a second call while one is in flight would just
      // queue an identical payload. The events that fire refresh are
      // throttled upstream (1s trailing) so dropping the overlap is safe.
      if (fetcher.state === 'idle') void fetcher.load('/api/sessions/list');
    };
  }, [fetcher]);

  const markSeen = useCallback((sessionId: number | string) => {
    const key = String(sessionId);
    const status = fetcher.data?.folders
      ?.flatMap((f) => f.sessions ?? [])
      .find((s) => String(s.id) === key)?.streamStatus;
    // Only terminal badges ack; `stream` rows must survive until agent_end.
    if (!status || status === 'stream' || seenRef.current.has(key)) return;
    seenRef.current.add(key);
    fetch(`/api/sessions/${encodeURIComponent(key)}/stream-seen`, { method: 'POST' })
      .then(() => {
        // Pull the authoritative list (row deleted server-side) and let the
        // pending-session ack effect observe an already-stripped status.
        if (fetcher.state === 'idle') void fetcher.load('/api/sessions/list');
      })
      .catch(() => {
        // Server still owns the badge; the next open re-acks.
        seenRef.current.delete(key);
      });
  }, [fetcher]);

  const value = useMemo<SidebarDataHandle>(() => {
    const data = fetcher.data;
    const seen = seenRef.current;
    return {
      folders: ((data?.folders ?? initialFolders) as WorkspaceFolderData[])
        // Optimistic badge strip for sessions marked seen this mount.
        .map((f) => seen.size
          ? { ...f, sessions: (f.sessions ?? []).map((s) => (seen.has(String(s.id)) ? { ...s, streamStatus: undefined } : s)) }
          : f),
      isMock: data?.isMock ?? false,
      initializing: !hasLoaded,
      refresh,
      markSeen,
      hasSeen: (id) => seen.has(String(id)),
    };
  }, [fetcher.data, initialFolders, hasLoaded, refresh, markSeen]);

  return <SidebarDataContext.Provider value={value}>{children}</SidebarDataContext.Provider>;
}

/**
 * Context accessor with a graceful fallback for consumers mounted outside the
 * provider (keeps legacy prop-driven trees working during the transition).
 */
export function useSidebarData(): SidebarDataHandle {
  const ctx = useContext(SidebarDataContext);
  if (ctx) return ctx;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- single hook call site
  return {
    folders: [],
    isMock: false,
    initializing: true,
    refresh: () => {},
    markSeen: () => {},
    hasSeen: () => false,
  };
}
