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
 * Refresh contract: the leading+trailing throttled stream-event hook, the
 * stream poll, the status-ack hook, and per-item mutations all call
 * `refresh()` — a plain `fetcher.load` that no longer revalidates the whole
 * document route.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createContext } from 'preact/compat';
import type { ReactNode } from 'preact/compat';
import { useFetcher } from '@/client/lib/router/fetcher';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import { SIDEBAR_IDLE_REFRESH_MS } from '@/shared/lib/workspace/refresh-cadence';
import { useInputRequiredAlert } from '@/client/hooks/ui/input-required-alert';
import type { WorkspaceFolderData } from '@/shared/types';
import type { SessionListPayload } from '@/server/lib/omp/session/sidebar-data.server';

export interface SidebarDataHandle {
  folders: WorkspaceFolderData[];
  isMock: boolean;
  /** True only before the FIRST successful load — drives the skeleton. */
  initializing: boolean;
  /** Fire a refresh (dedup: while a load is in flight this is a no-op). */
  refresh: () => void;
  /**
   * User-initiated refresh: the same load as `refresh`, but it also raises
   * `refreshing` until THAT load settles, so a toolbar button can spin while
   * it runs. The background paths (idle poll, stream events, status ack) go
   * through `refresh` and deliberately never raise the flag — a spinner that
   * turns on by itself every 30s reads as a broken list.
   */
  refreshNow: () => void;
  /** True while a `refreshNow` load is in flight. */
  refreshing: boolean;
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
  const fetcher = useFetcher<SessionListPayload>();
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

  // User-initiated refresh. Unlike `refresh` it does NOT skip an in-flight
  // load — a click is an explicit "read it again now", and the fetcher aborts
  // the superseded request rather than letting two answer. The spinner follows
  // THIS load only: a token marks the newest click, so a background poll
  // settling in between cannot stop a spin that is still running, and a
  // superseded click cannot stop the newer one's.
  const [refreshing, setRefreshing] = useState(false);
  const refreshTokenRef = useRef(0);
  const refreshNow = useCallback(() => {
    const token = ++refreshTokenRef.current;
    setRefreshing(true);
    void fetcher.load('/api/sessions/list').finally(() => {
      if (refreshTokenRef.current === token) setRefreshing(false);
    });
  }, [fetcher]);

  // Idle keep-alive: the throttled stream-event hook and useStreamPoll only
  // fire while THIS client streams, so changes made elsewhere (another tab,
  // a background omp process finishing, an archive from a second browser)
  // never surfaced until the user interacted. A slow poll closes that gap;
  // the idle-check above keeps it from piling onto a load the event path
  // just started.
  //
  // Gated off while anything streams: `useStreamPoll` already covers that
  // state on a tighter cadence, so the idle tick would be pure overlap.
  const hasStreaming = Boolean(
    fetcher.data?.folders?.some((folder) =>
      folder.sessions?.some((session) => session.streamStatus === 'stream'),
    ),
  );
  // Fires for ANY session, including one this tab never opened — the cue that an
  // agent is blocked on an answer must not depend on the open timeline.
  useInputRequiredAlert(fetcher.data?.folders ?? []);
  usePanelRefresh(refresh, !hasStreaming, SIDEBAR_IDLE_REFRESH_MS);

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
    // A session that streams again earns a fresh badge lifecycle: forget the
    // ack from an earlier run. Without this, a session opened with a terminal
    // badge stays stripped for the whole mount — its spinner never renders no
    // matter how many times the list refetches, and only a page reload (fresh
    // mount) brings it back.
    if (seen.size && data?.folders) {
      for (const folder of data.folders) {
        for (const session of folder.sessions ?? []) {
          if (session.streamStatus === 'stream') seen.delete(String(session.id));
        }
      }
    }
    return {
      folders: ((data?.folders ?? initialFolders) as WorkspaceFolderData[])
        // Optimistic badge strip for sessions marked seen this mount. NEVER
        // strip a live `stream` row — the spinner must always render.
        .map((f) => seen.size
          ? { ...f, sessions: (f.sessions ?? []).map((s) => (
              seen.has(String(s.id)) && s.streamStatus && s.streamStatus !== 'stream'
                ? { ...s, streamStatus: undefined }
                : s
            )) }
          : f),
      isMock: data?.isMock ?? false,
      initializing: !hasLoaded,
      refresh,
      refreshNow,
      refreshing,
      markSeen,
      hasSeen: (id) => seen.has(String(id)),
    };
  }, [fetcher.data, initialFolders, hasLoaded, refresh, refreshNow, refreshing, markSeen]);

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
    refreshNow: () => {},
    refreshing: false,
    markSeen: () => {},
    hasSeen: () => false,
  };
}
