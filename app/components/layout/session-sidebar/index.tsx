import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import { SettingsModal, AboutModal, NewWorkspaceModal, SchedulerModal } from '@/components/layout/session-sidebar/Modals';
import { SessionSidebarHeader } from '@/components/layout/session-sidebar/Header';
import { SessionSidebarToolbar } from '@/components/layout/session-sidebar/Toolbar';
import { SessionSidebarFooter } from '@/components/layout/session-sidebar/Footer';
import { SessionSidebarSessionList } from '@/components/layout/session-sidebar/SessionList';
import { SessionListSkeleton } from '@/components/layout/session-sidebar/Skeleton';
import { Toast } from '@/components/common/Toast';
import { pendingSessionCreatedAt, pendingSessionTitle } from '@/lib/omp/session/default-title';
import { triggerSessionPrewarm, spawnCwdForNewSession } from '@/lib/omp/session/prewarm';
import { isValidSessionSortOption, sortFolders } from '@/lib/workspace/sidebar-sort';
import type { SessionItemData, SessionSortOption } from '@/types';
import { useScrollbarFade } from '@/hooks/ui/scrollbar-fade';
import { useToasts } from '@/hooks/ui/toasts';
import { useUpdates } from '@/hooks/ui/updates';
import { useSessionStatusAck, buildSidebarSessionStatus } from '@/hooks/chat/omp/session-statuses';
import { useStreamPoll } from '@/hooks/chat/omp/stream-poll';
import { useSidebarRevalidation } from '@/hooks/chat/omp/revalidation-throttle';
import { useSidebarData } from '@/hooks/chat/omp/session-list';

export function SessionSidebar({ className = '', onClose, appSettings = {} }: { className?: string, onClose?: () => void, appSettings?: Record<string, any> }) {
  const { folders, initializing, refresh } = useSidebarData();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');
  const activeSessionId = sessionParam ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam)) : null;

  // Refresh the session list when a new omp session is spawned or its title
  // changes (the chat timeline dispatches omp:session-updated after the JSONL
  // is written). No SSE — a plain event + throttled refetch keeps it cheap,
  // and the trailing throttle coalesces per-frame dispatches during a run into
  // one list fetch per second.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useSidebarRevalidation(() => refreshRef.current());

  useEffect(() => {
    const handleWorkspaceUpdated = () => refreshRef.current();
    window.addEventListener('omp:workspace-updated', handleWorkspaceUpdated);
    return () => window.removeEventListener('omp:workspace-updated', handleWorkspaceUpdated);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  
  // Modals for new workspace and scheduler
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const updates = useUpdates();
  const { toasts, pushToast, dismissToast } = useToasts();
  
  // Sidebar inline states
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  // Options dropdown state
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Seeded from the server (app_settings.omp_sidebar_sort) so the SSR HTML and
  // the first client render agree — reading localStorage during render is what
  // made the list re-sort right after hydration.
  const [sortOption, setSortOption] = useState<SessionSortOption>(() =>
    isValidSessionSortOption(appSettings.omp_sidebar_sort) ? appSettings.omp_sidebar_sort : 'A-Z',
  );

  const sortPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSort = useCallback((opt: SessionSortOption) => {
    if (sortPersistTimerRef.current) clearTimeout(sortPersistTimerRef.current);
    sortPersistTimerRef.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ omp_sidebar_sort: opt }),
      }).catch(() => {});
    }, 200);
  }, []);

  useEffect(() => () => {
    if (sortPersistTimerRef.current) clearTimeout(sortPersistTimerRef.current);
  }, []);

  // One-time migration off localStorage, and only while the server holds no
  // preference yet. Gating on that is what makes it one-time: an ungated adopt
  // would let a stale localStorage entry on any client overwrite the value the
  // server already owns, forever.
  const hasServerSort = isValidSessionSortOption(appSettings.omp_sidebar_sort);
  useEffect(() => {
    if (hasServerSort) return;
    const saved = localStorage.getItem('omp_sidebar_sort');
    if (!isValidSessionSortOption(saved)) return;
    setSortOption(saved);
    persistSort(saved);
  }, [hasServerSort, persistSort]);

  const handleSortChange = (opt: SessionSortOption) => {
    setSortOption(opt);
    localStorage.setItem('omp_sidebar_sort', opt);
    setOptionsOpen(false);
    persistSort(opt);
  };

  const { isScrolling, handleScroll } = useScrollbarFade();

  // Live session status — server-tracked via SQLite, riding the same loader
  // data as the session list. Spinner while `stream`; a one-shot terminal
  // badge (acknowledged server-side on open, dropped by the next revalidate).
  const sessionStatus = useMemo(() => buildSidebarSessionStatus(folders), [folders]);
  useSessionStatusAck(sessionStatus, activeSessionId, () => refreshRef.current());
  // Background sessions finishing while the user sits elsewhere: refetch
  // on a cadence — but only while something is actually streaming.
  useStreamPoll(sessionStatus, () => refreshRef.current());

  const handleSelectSession = (id: number | string) => {
    setSearchParams(prev => {
      prev.set('sessionId', id.toString());
      // Navigating away from a session must also exit its transcript view.
      if (prev.has('subagent')) prev.delete('subagent');
      return prev;
    }, { replace: true });
  };

  /** The folder whose context a new session will inherit — same resolution
   *  the send path uses, so the prewarmed cwd matches the spawn cwd. */
  const prewarmForNewSession = (folderId?: number) => {
    const cwd = spawnCwdForNewSession(folders, sessionParam, folderId);
    if (cwd) triggerSessionPrewarm(cwd, appSettings.omp_access_mode);
  };

  const handleNewSession = () => {
    prewarmForNewSession();
    setSearchParams(prev => {
      const currentSessionId = prev.get('sessionId');
      const next = new URLSearchParams(prev);
      // Client-side pending session: shown immediately with a default title;
      // the real omp session id replaces it on first send.
      next.set('sessionId', `new-${Date.now()}`);
      if (currentSessionId) {
        const currentFolder = folders.find(f => f.sessions?.some((s: any) => String(s.id) === String(currentSessionId)));
        if (currentFolder) {
          next.set('folderId', currentFolder.id.toString());
        }
      } else {
        next.delete('folderId');
      }
      return next;
    }, { replace: true });
  };

  const handleNewSessionForFolder = (folderId: number) => {
    prewarmForNewSession(folderId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', `new-${Date.now()}`);
      next.set('folderId', folderId.toString());
      return next;
    }, { replace: true });
  };

  // Filter and sort folders
  const processedFolders = useMemo(() => {
    let result = [...folders];

    // The active session may not be in the sidebar list yet: a pending
    // "new-…" session, or a freshly spawned omp session whose JSONL has not
    // been scanned (the chat timeline signals omp:session-updated once it is).
    // Render it with the timestamped default title so there is never a gap
    // between sending a chat and the session appearing with its real title.
    const sessionExists = result.some(f => f.sessions?.some((s: any) => String(s.id) === String(sessionParam)));
    const pendingId = sessionParam && !sessionExists ? sessionParam : null;
    if (pendingId) {
      const folderIdParam = searchParams.get('folderId');
      const target = folderIdParam
        ? result.find(f => String(f.id) === String(folderIdParam))
        : result[0];
      // The placeholder only bridges the gap before the JSONL scan surfaces the
      // real row; rendering it alongside a row the folder already lists is what
      // made the item blink.
      const alreadyListed = Boolean(
        target?.sessions?.some((s: any) => String(s.id) === String(pendingId)),
      );
      if (target && !alreadyListed) {
        // A pending id carries its creation epoch, so the stamp is stable across
        // recomputes instead of reshuffling LATEST_SESSION on every revalidate.
        // An adopted real id has no epoch; the row is newest by definition then.
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
            // Read by @/lib/workspace/sidebar-sort to rank this folder newest.
            created_at: stamp,
            updated_at: stamp,
          };
          return { ...f, isExpanded: true, sessions: [pending, ...(f.sessions || [])] };
        });
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(folder => {
        const matchFolder = folder.name.toLowerCase().includes(q);
        const matchSession = folder.sessions?.some((s: any) => s.title.toLowerCase().includes(q));
        return matchFolder || matchSession;
      }).map(folder => {
        // If we are searching, we also filter the sessions within the folder
        const filteredSessions = folder.sessions?.filter((s: any) => 
          folder.name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        );
        return { ...folder, sessions: filteredSessions, isExpanded: true };
      });
    }

    // Ordering is shared with the mobile sidebar so the two cannot drift.
    result = sortFolders(result, sortOption);

    return result;
  }, [folders, searchQuery, sortOption, sessionParam, searchParams]);

  return (
    <>
      <aside className={`flex flex-col bg-paper h-full ${className}`}>
        <SessionSidebarHeader onNewSession={handleNewSession} />

        <SessionSidebarToolbar
          isSearchVisible={isSearchVisible}
          searchQuery={searchQuery}
          showArchived={showArchived}
          optionsOpen={optionsOpen}
          sortOption={sortOption}
          onToggleSearch={() => setIsSearchVisible(!isSearchVisible)}
          onSearchChange={setSearchQuery}
          onToggleArchived={() => setShowArchived(!showArchived)}
          onHideArchived={() => setShowArchived(false)}
          onToggleOptions={() => setOptionsOpen(!optionsOpen)}
          onCloseOptions={() => setOptionsOpen(false)}
          onSortChange={handleSortChange}
          onNewWorkspace={() => setNewWorkspaceOpen(true)}
          onScheduler={() => setSchedulerOpen(true)}
          onRefresh={() => refreshRef.current()}
          onClose={onClose}
        />

        {initializing ? (
          <SessionListSkeleton />
        ) : (
          <SessionSidebarSessionList
            folders={processedFolders}
            activeSessionId={activeSessionId}
            searchQuery={searchQuery}
            showArchived={showArchived}
            sessionStatus={sessionStatus}
            isScrolling={isScrolling}
            onScroll={handleScroll}
            onSelectSession={handleSelectSession}
            onNewSessionForFolder={handleNewSessionForFolder}
          />
        )}

        <SessionSidebarFooter
          onSettings={() => setSettingsOpen(true)}
          onInfo={() => setInfoOpen(true)}
          updateAvailable={updates.hasUpdate}
          onUpdateClick={() => {
            setInfoOpen(true);
            void updates.check();
          }}
        />
      </aside>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} appSettings={appSettings} />

      {/* Info Modal */}
      <AboutModal
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
        updates={updates}
        onToast={pushToast}
      />

      {/* New Workspace Modal */}
      <NewWorkspaceModal
        isOpen={newWorkspaceOpen}
        onClose={() => setNewWorkspaceOpen(false)}
        onCreate={async ({ name, path }) => {
          const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          window.location.reload();
        }}
      />

      {/* Scheduler Modal */}
      <SchedulerModal isOpen={schedulerOpen} onClose={() => setSchedulerOpen(false)} />

      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </>
  );
}