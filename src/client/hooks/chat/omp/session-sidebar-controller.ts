/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared session-sidebar controller for the desktop and mobile sidebars.
 *
 * Owns the pieces both sidebars used to clone: the sort preference (seeded
 * from the server, debounced persistence), search state, the filtered/sorted
 * folder list, the `omp:workspace-updated` listener, the live session-status
 * wiring (ack + stream poll + throttled revalidation), and session selection.
 *
 * The two sidebars differ in two places, both parameterised here rather than
 * forked: the desktop injects a pending-session placeholder and force-expands
 * search hits, while the mobile sidebar delegates selection to its layout and
 * closes the drawer afterwards.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import { isValidSessionSortOption, sortFolders } from '@/shared/lib/workspace/sidebar-sort';
import { pendingSessionCreatedAt, pendingSessionTitle } from '@/shared/lib/omp/session/default-title';
import { buildSidebarSessionStatus, useSessionStatusAck } from '@/client/hooks/chat/omp/session-statuses';
import { useStreamPoll } from '@/client/hooks/chat/omp/stream-poll';
import { useSidebarRevalidation } from '@/client/hooks/chat/omp/revalidation-throttle';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { writeSetting } from '@/shared/lib/settings/client';
import type { SessionItemData, SessionSortOption, WorkspaceFolderData } from '@/shared/types';

/** Debounce before the sort preference is POSTed to /api/settings (ms). */
const SORT_PERSIST_DEBOUNCE_MS = 200;

export interface SessionSidebarControllerOptions {
  /**
   * Desktop only: inject a pending `new-…` session placeholder and force-expand
   * search matches. Mobile filters without expanding.
   */
  includePendingSessions?: boolean;
  /**
   * Mobile only: hand selection to the layout (which owns the URL + screen),
   * instead of performing the URL swap here.
   */
  onSelectSession?: (id: number | string) => void;
  /** Called after selection — mobile closes the drawer here. */
  onAfterSelect?: () => void;
}

export interface SessionSidebarController {
  folders: WorkspaceFolderData[];
  initializing: boolean;
  refresh: () => void;
  /** User-initiated refresh — raises `refreshing` until that load settles. */
  refreshNow: () => void;
  /** True while a `refreshNow` load is in flight (drives the toolbar spinner). */
  refreshing: boolean;
  activeSessionId: number | string | null;
  sessionParam: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  optionsOpen: boolean;
  setOptionsOpen: (value: boolean) => void;
  sortOption: SessionSortOption;
  handleSortChange: (opt: SessionSortOption) => void;
  processedFolders: WorkspaceFolderData[];
  sessionStatus: Record<string, 'stream' | 'finish' | 'abort'>;
  handleSelectSession: (id: number | string) => void;
}

export function useSessionSidebarController(
  appSettings: Record<string, any> = {},
  options: SessionSidebarControllerOptions = {},
): SessionSidebarController {
  const { includePendingSessions = false, onSelectSession, onAfterSelect } = options;
  const { folders, initializing, refresh, refreshNow, refreshing, markSeen, hasSeen } = useSidebarData();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');
  const activeSessionId = sessionParam
    ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam))
    : null;

  // A stable refresh reference keeps the revalidation/ack/poll hooks subscribed
  // once while always calling the latest refresh.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const revalidate = useCallback(() => refreshRef.current(), []);

  // Refresh the session list when a new omp session is spawned or its title
  // changes. No SSE — a plain event + throttled refetch keeps it cheap, and the
  // trailing throttle coalesces per-frame dispatches during a run into one list
  // fetch per second.
  useSidebarRevalidation(revalidate);

  useChamberEvent('omp:workspace-updated', () => refreshRef.current());

  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Seeded from the server (app_settings.omp_sidebar_sort) so the SSR HTML and
  // the first client render agree.
  const [sortOption, setSortOption] = useState<SessionSortOption>(() =>
    isValidSessionSortOption(appSettings.omp_sidebar_sort) ? appSettings.omp_sidebar_sort : 'A-Z',
  );

  const sortPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSort = useCallback((opt: SessionSortOption) => {
    if (sortPersistTimerRef.current) clearTimeout(sortPersistTimerRef.current);
    sortPersistTimerRef.current = setTimeout(() => {
      writeSetting('omp_sidebar_sort', opt);
    }, SORT_PERSIST_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (sortPersistTimerRef.current) clearTimeout(sortPersistTimerRef.current);
  }, []);

  const handleSortChange = (opt: SessionSortOption) => {
    setSortOption(opt);
    setOptionsOpen(false);
    persistSort(opt);
  };

  // Live session status — server-tracked via SQLite, riding the same loader
  // data as the session list. Spinner while `stream`; a one-shot terminal
  // badge (acknowledged server-side on open, dropped by the next revalidate).
  const sessionStatus = useMemo(() => buildSidebarSessionStatus(folders), [folders]);
  // hasSeen: clicks already acked + optimistically stripped these badges, so
  // the effect must not re-POST while the authoritative list is still stale.
  useSessionStatusAck(sessionStatus, activeSessionId, revalidate, hasSeen);
  // Background sessions finishing while the user sits elsewhere: refetch on a
  // cadence — but only while something is actually streaming.
  useStreamPoll(sessionStatus, revalidate);

  const handleSelectSession = (id: number | string) => {
    // One-shot terminal badge (check) clears on open: optimistic strip + server
    // ack. Keep BEFORE the URL swap so the click feels instant.
    markSeen(id);
    if (onSelectSession) {
      onSelectSession(id);
    } else {
      setSearchParams(prev => {
        prev.set('sessionId', id.toString());
        // Navigating away from a session must also exit its transcript view.
        if (prev.has('subagent')) prev.delete('subagent');
        return prev;
      }, { replace: true });
    }
    onAfterSelect?.();
  };

  // Filter and sort folders
  const processedFolders = useMemo(() => {
    let result = [...folders];

    if (includePendingSessions) {
      // The active session may not be in the sidebar list yet: a pending
      // "new-…" session, or a freshly spawned omp session whose JSONL has not
      // been scanned (the chat timeline signals omp:session-updated once it is).
      // Render it with the timestamped default title so there is never a gap
      // between sending a chat and the session appearing with its real title.
      const sessionExists = result.some(f => f.sessions?.some((s) => String(s.id) === String(sessionParam)));
      const pendingId = sessionParam && !sessionExists ? sessionParam : null;
      if (pendingId) {
        const folderIdParam = searchParams.get('folderId');
        const target = folderIdParam
          ? result.find(f => String(f.id) === String(folderIdParam))
          : result[0];
        // The placeholder only bridges the gap before the JSONL scan surfaces
        // the real row; rendering it alongside a row the folder already lists
        // is what made the item blink.
        const alreadyListed = Boolean(
          target?.sessions?.some((s) => String(s.id) === String(pendingId)),
        );
        if (target && !alreadyListed) {
          // A pending id carries its creation epoch, so the stamp is stable
          // across recomputes instead of reshuffling LATEST_SESSION on every
          // revalidate. An adopted real id has no epoch; the row is newest by
          // definition then.
          const epochMs = pendingSessionCreatedAt(pendingId);
          const stamp = Number.isFinite(epochMs)
            ? new Date(epochMs).toISOString()
            : new Date().toISOString();
          result = result.map(f => {
            if (f.id !== target.id) return f;
            const pending: SessionItemData = {
              id: pendingId,
              folder_id: f.id,
              title: pendingSessionTitle(pendingId),
              // Read by @/shared/lib/workspace/sidebar-sort to rank this folder newest.
              created_at: stamp,
              updated_at: stamp,
            };
            return { ...f, isExpanded: true, sessions: [pending, ...(f.sessions || [])] };
          });
        }
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (includePendingSessions) {
        result = result.filter(folder => {
          const matchFolder = folder.name.toLowerCase().includes(q);
          const matchSession = folder.sessions?.some((s) => s.title.toLowerCase().includes(q));
          return matchFolder || matchSession;
        }).map(folder => {
          // If we are searching, we also filter the sessions within the folder
          const filteredSessions = folder.sessions?.filter((s) =>
            folder.name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
          );
          return { ...folder, sessions: filteredSessions, isExpanded: true };
        });
      } else {
        result = result.map(folder => {
          const matchesFolderName = folder.name.toLowerCase().includes(q);
          const filteredSessions = (folder.sessions || []).filter(s =>
            s.title.toLowerCase().includes(q)
          );
          if (matchesFolderName) return folder;
          return { ...folder, sessions: filteredSessions };
        }).filter(f => f.sessions && f.sessions.length > 0);
      }
    }

    // Ordering is shared with the other sidebar so the two cannot drift.
    result = sortFolders(result, sortOption);

    return result;
  }, [folders, searchQuery, sortOption, sessionParam, searchParams, includePendingSessions]);

  return {
    folders,
    initializing,
    refresh: revalidate,
    refreshNow,
    refreshing,
    activeSessionId,
    sessionParam,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    optionsOpen,
    setOptionsOpen,
    sortOption,
    handleSortChange,
    processedFolders,
    sessionStatus,
    handleSelectSession,
  };
}
