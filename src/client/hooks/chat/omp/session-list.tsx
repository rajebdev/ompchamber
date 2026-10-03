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
 *
 * Two optimistic overlays ride this snapshot: the seen-strip (a terminal badge
 * this mount already acked) and the pending `stream` force (a send whose
 * dispatch round trip is still in flight), both from `stream-overlay.ts`.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createContext } from 'preact/compat';
import type { ReactNode } from 'preact/compat';
import { useFetcher } from '@/client/lib/router/fetcher';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import { SIDEBAR_IDLE_REFRESH_MS } from '@/shared/lib/workspace/refresh-cadence';
import { useInputRequiredAlert } from '@/client/hooks/ui/input-required-alert';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import {
  applyStreamOverlay,
  releaseObservedPending,
  SESSION_TITLE_HINT_EVENT,
  STREAM_PENDING_EVENT,
  type SessionTitleHintDetail,
  type StreamPendingDetail,
} from '@/client/hooks/chat/omp/stream-overlay';
import type { WorkspaceFolderData } from '@/shared/types';
import type { SessionListPayload } from '@/server/lib/omp/session/sidebar-data.server';

export interface SidebarDataHandle {
  folders: WorkspaceFolderData[];
  isMock: boolean;
  /** True only before the FIRST successful load — drives the skeleton. */
  initializing: boolean;
  /**
   * Fire a refresh. A call arriving while a load is in flight is coalesced
   * into one trailing load rather than dropped: the events that fire this are
   * throttled upstream (1s trailing), and the dropped call is usually the one
   * carrying a send's live `stream` row.
   */
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
  /**
   * True while a session carries an armed optimistic `stream` mark: a send this
   * tab started whose authoritative row has not arrived yet. The sidebar's
   * PLACEHOLDER row — a `new-…` chat, or a spawned session the list has not
   * scanned yet — is built outside `folders`, so it needs this predicate to
   * paint a spinner at all.
   */
  isStreamPending: (id: number | string | null | undefined) => boolean;
  /**
   * Text the user just sent for this session, shown by the sidebar's
   * PLACEHOLDER row while omp's transcript scan cannot name the session yet
   * (omp creates the file only at the first assistant message). Undefined once
   * the real row exists — the placeholder is not drawn then.
   */
  titleHint: (id: number | string | null | undefined) => string | undefined;
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
  // Sessions whose send is in flight but whose server `stream` row may not
  // exist yet, by id → the clock the mark was armed at. Rendered as `stream`
  // and dropped as soon as a snapshot that landed AFTER the arm carries a real
  // status (see `releaseObservedPending`).
  const pendingRef = useRef<Map<string, number>>(new Map());
  // Text the user just sent, by session id — shown by the placeholder row until
  // omp's transcript scan can name the session (its file appears only at the
  // first assistant message). Dropped when the real row arrives.
  const titleHintRef = useRef<Map<string, string>>(new Map());
  // The refs above are deliberately not reactive; this bumps a render when one
  // of them changes so the overlays below re-apply. Read only as a dependency.
  const [overlayVersion, setOverlayVersion] = useState(0);

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

  // A coalesced refresh is retried once the in-flight load settles. Its caller
  // is usually the leading edge of `omp:session-updated` right after a send —
  // i.e. the very read that carries this session's live `stream` row — and
  // dropping it left the sidebar spinner dark until the 30s idle poll.
  const retryRefreshRef = useRef(false);
  const refresh = useMemo(() => {
    return () => {
      if (fetcher.state !== 'idle') {
        retryRefreshRef.current = true;
        return;
      }
      retryRefreshRef.current = false;
      void fetcher.load('/api/sessions/list');
    };
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !retryRefreshRef.current) return;
    retryRefreshRef.current = false;
    void fetcher.load('/api/sessions/list');
  }, [fetcher.state, fetcher]);

  // The send path arms/disarms the optimistic `stream` mark; the sidebar only
  // listens. A message rather than a prop because the send lives in the chat
  // timeline while the mark must outlive any single timeline — a session switch
  // is exactly when the local `isGenerating` is gone.
  useChamberEvent(STREAM_PENDING_EVENT, (event) => {
    const detail = (event as CustomEvent<StreamPendingDetail>).detail;
    if (!detail?.sessionId) return;
    const key = String(detail.sessionId);
    if (detail.pending) {
      pendingRef.current.set(key, Date.now());
    } else if (!pendingRef.current.delete(key)) {
      // Already gone: nothing to re-render for.
      return;
    }
    setOverlayVersion((v) => v + 1);
  });

  // The text the user just sent, for the placeholder row that stands in until
  // omp's transcript scan can name the session.
  useChamberEvent(SESSION_TITLE_HINT_EVENT, (event) => {
    const detail = (event as CustomEvent<SessionTitleHintDetail>).detail;
    if (!detail?.sessionId || !detail.title) return;
    const key = String(detail.sessionId);
    if (titleHintRef.current.get(key) === detail.title) return;
    titleHintRef.current.set(key, detail.title);
    setOverlayVersion((v) => v + 1);
  });

  // Hand a session back to the authoritative status the moment a snapshot that
  // landed after the arm carries one: the server wrote `stream` before
  // answering the send, so such a read cannot be the run's absence.
  useEffect(() => {
    if (!fetcher.data?.folders) return;
    // A hint lives only until omp's transcript scan surfaces the session; the
    // real row carries the real title, and the placeholder is not drawn.
    if (titleHintRef.current.size) {
      const listed = new Set<string>();
      for (const folder of fetcher.data.folders) {
        for (const session of folder.sessions ?? []) listed.add(String(session.id));
      }
      for (const key of titleHintRef.current.keys()) {
        if (listed.has(key)) titleHintRef.current.delete(key);
      }
    }
    if (releaseObservedPending(pendingRef.current, fetcher.data.folders)) {
      setOverlayVersion((v) => v + 1);
    }
  }, [fetcher.data]);

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
    setOverlayVersion((v) => v + 1);
    fetch(`/api/sessions/${encodeURIComponent(key)}/stream-seen`, { method: 'POST' })
      .then(() => {
        // Pull the authoritative list (row deleted server-side) and let the
        // pending-session ack effect observe an already-stripped status.
        if (fetcher.state === 'idle') void fetcher.load('/api/sessions/list');
      })
      .catch(() => {
        // Server still owns the badge; the next open re-acks.
        seenRef.current.delete(key);
        setOverlayVersion((v) => v + 1);
      });
  }, [fetcher]);

  const value = useMemo<SidebarDataHandle>(() => {
    const data = fetcher.data;
    const seen = seenRef.current;
    const pending = pendingRef.current;
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
      // The seen-strip (a one-shot terminal badge this mount acked) then the
      // optimistic `stream` force (a send whose dispatch round trip is still
      // in flight), applied in that order. NEVER strip a live `stream` row.
      folders: applyStreamOverlay(
        (data?.folders ?? initialFolders) as WorkspaceFolderData[],
        seen,
        pending,
      ),
      isMock: data?.isMock ?? false,
      initializing: !hasLoaded,
      refresh,
      refreshNow,
      refreshing,
      markSeen,
      hasSeen: (id) => seen.has(String(id)),
      isStreamPending: (id) => id !== null && id !== undefined && pending.has(String(id)),
      titleHint: (id) => (id === null || id === undefined ? undefined : titleHintRef.current.get(String(id))),
    };
    // `overlayVersion` is the re-render trigger for the two refs above.
  }, [fetcher.data, initialFolders, hasLoaded, refresh, refreshNow, refreshing, markSeen, overlayVersion]);

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
    isStreamPending: () => false,
    titleHint: () => undefined,
  };
}
