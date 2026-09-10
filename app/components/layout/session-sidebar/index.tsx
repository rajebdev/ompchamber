import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useRevalidator } from '@remix-run/react';
import { SettingsModal, AboutModal, NewWorkspaceModal, SchedulerModal } from '@/components/layout/session-sidebar/Modals';
import { SessionSidebarHeader } from '@/components/layout/session-sidebar/Header';
import { SessionSidebarToolbar, type SortOption } from '@/components/layout/session-sidebar/Toolbar';
import { SessionSidebarFooter } from '@/components/layout/session-sidebar/Footer';
import { SessionSidebarSessionList } from '@/components/layout/session-sidebar/SessionList';
import { useScrollbarFade } from '@/hooks/ui/scrollbar-fade';

export function SessionSidebar({ className = '', folders = [], onClose, appSettings = {} }: { className?: string, folders?: any[], onClose?: () => void, appSettings?: Record<string, any> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const sessionParam = searchParams.get('sessionId');
  const activeSessionId = sessionParam ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam)) : null;

  // Refresh the session list when a new omp session is spawned or its title
  // changes (the chat timeline dispatches omp:session-updated after the JSONL
  // is written). No SSE — a plain event + revalidator keeps it cheap.
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        revalidatorRef.current.revalidate();
      }, 300);
    };
    window.addEventListener('omp:session-updated', scheduleRefresh);
    return () => {
      window.removeEventListener('omp:session-updated', scheduleRefresh);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  
  // Modals for new workspace and scheduler
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  
  // Sidebar inline states
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  // Options dropdown state
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    if (typeof window === 'undefined') return 'A-Z';
    const saved = localStorage.getItem('omp_sidebar_sort');
    return saved === 'A-Z' || saved === 'Z-A' || saved === 'LATEST_SESSION' || saved === 'LATEST_ADDED' ? saved : 'A-Z';
  });

  const handleSortChange = (opt: SortOption) => {
    setSortOption(opt);
    localStorage.setItem('omp_sidebar_sort', opt);
    setOptionsOpen(false);
  };

  const { isScrolling, handleScroll } = useScrollbarFade();

  // Live session status: the chat timeline dispatches omp:session-processing
  // (processing true/false) through its single setGenerating throat, so the
  // sidebar can paint a spinner while a session runs and a check when done.
  const [sessionStatus, setSessionStatus] = useState<Record<string, 'processing' | 'done'>>({});
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  useEffect(() => {
    const onProcessing = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string; processing?: boolean } | undefined;
      const sid = detail?.sessionId;
      if (!sid) return;
      setSessionStatus(prev => {
        const next = { ...prev };
        if (detail.processing) {
          next[sid] = 'processing';
        } else if (String(sid) === String(activeSessionIdRef.current)) {
          // Completed while the user is already looking at it — no check.
          delete next[sid];
        } else {
          next[sid] = 'done';
        }
        return next;
      });
    };
    window.addEventListener('omp:session-processing', onProcessing);
    return () => window.removeEventListener('omp:session-processing', onProcessing);
  }, []);

  // The check is a "finished while you weren't looking" badge: opening a
  // session or navigating to another one clears it. Spinners survive.
  useEffect(() => {
    setSessionStatus(prev => {
      const next: Record<string, 'processing' | 'done'> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v === 'processing') next[k] = v;
      }
      return next;
    });
  }, [activeSessionId]);

  const handleSelectSession = (id: number | string) => {
    setSearchParams(prev => {
      prev.set('sessionId', id.toString());
      return prev;
    }, { replace: true });
  };

  const handleNewSession = () => {
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
    // Render it as an "Untitled session" item so there is never a gap between
    // sending a chat and the session appearing with its real title.
    const sessionExists = result.some(f => f.sessions?.some((s: any) => String(s.id) === String(sessionParam)));
    const pendingId = sessionParam && !sessionExists ? sessionParam : null;
    if (pendingId) {
      const folderIdParam = searchParams.get('folderId');
      const target = folderIdParam
        ? result.find(f => String(f.id) === String(folderIdParam))
        : result[0];
      if (target) {
        result = result.map(f => {
          if (f.id !== target.id) return f;
          const pending = { id: pendingId, title: 'Untitled session', is_active: 1 };
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

    // Sort folders
    result.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      switch (sortOption) {
        case 'A-Z':
          return a.name.localeCompare(b.name);
        case 'Z-A':
          return b.name.localeCompare(a.name);
        case 'LATEST_SESSION':
          // Assuming higher session id means latest for this demo
          const maxIdA = a.sessions?.length ? Math.max(...a.sessions.map((s: any) => s.id)) : 0;
          const maxIdB = b.sessions?.length ? Math.max(...b.sessions.map((s: any) => s.id)) : 0;
          return maxIdB - maxIdA;
        case 'LATEST_ADDED':
          // Assuming higher folder id means latest added
          return b.id - a.id;
        default:
          return 0;
      }
    });

    return result;
  }, [folders, searchQuery, sortOption]);

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
          onClose={onClose}
        />

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

        <SessionSidebarFooter onSettings={() => setSettingsOpen(true)} onInfo={() => setInfoOpen(true)} />
      </aside>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} appSettings={appSettings} />

      {/* Info Modal */}
      <AboutModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />

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
    </>
  );
}
