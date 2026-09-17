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

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import type { WorkspaceFolderData } from '@/types';
import type { SidebarData } from '@/lib/omp/session/sidebar-data.server';

export interface SidebarDataHandle {
  folders: WorkspaceFolderData[];
  isMock: boolean;
  /** True only before the FIRST successful load — drives the skeleton. */
  initializing: boolean;
  /** Fire a refresh (dedup: while a load is in flight this is a no-op). */
  refresh: () => void;
}

const SidebarDataContext = createContext<SidebarDataHandle | null>(null);

export function SidebarDataProvider({ children, initialFolders = [] }: { children: React.ReactNode; initialFolders?: WorkspaceFolderData[] }) {
  const fetcher = useFetcher<SidebarData>();
  const [hasLoaded, setHasLoaded] = useState(false);
  const firstLoadRef = useRef(false);

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

  const value = useMemo<SidebarDataHandle>(() => {
    const data = fetcher.data;
    return {
      folders: (data?.folders ?? initialFolders) as WorkspaceFolderData[],
      isMock: data?.isMock ?? false,
      initializing: !hasLoaded,
      refresh,
    };
  }, [fetcher.data, initialFolders, hasLoaded, refresh]);

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
  return { folders: [], isMock: false, initializing: true, refresh: () => {} };
}
