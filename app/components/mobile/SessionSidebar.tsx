import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRevalidator } from '@remix-run/react';
import type { SessionSortOption, WorkspaceFolderData } from '@/types';
import { MobileSessionHeader } from '@/components/mobile/mobile-session-sidebar/Header';
import { MobileSessionToolbar } from '@/components/mobile/mobile-session-sidebar/Toolbar';
import { MobileSessionList } from '@/components/mobile/mobile-session-sidebar/List';
import { MobileSessionFooter } from '@/components/mobile/mobile-session-sidebar/Footer';
import { Toast } from '@/components/common/Toast';
import { isValidSessionSortOption, sortFolders } from '@/lib/workspace/sidebar-sort';
import { 
  AboutModal, 
  NewWorkspaceModal, 
  SchedulerModal 
} from '@/components/layout/session-sidebar/Modals';
import { useOnClickOutside } from '@/hooks/ui/on-click-outside';
import { useScrollbarFade } from '@/hooks/ui/scrollbar-fade';
import { useToasts } from '@/hooks/ui/toasts';
import { useUpdates } from '@/hooks/ui/updates';

interface MobileSessionSidebarProps {
  folders: WorkspaceFolderData[];
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSession: () => void;
  onCreateFolder: (input: { name: string; path?: string }) => Promise<void> | void;
  onClose: () => void;
  onDesktopToggle?: () => void;
  appSettings?: Record<string, any>;
}

export function MobileSessionSidebar({
  folders,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCreateFolder,
  onClose,
  onDesktopToggle,
  appSettings = {}
}: MobileSessionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true
  });

  // Modals state (matching desktop)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const revalidator = useRevalidator();
  const updates = useUpdates();
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    const handleWorkspaceUpdated = () => revalidator.revalidate();
    window.addEventListener('omp:workspace-updated', handleWorkspaceUpdated);
    return () => window.removeEventListener('omp:workspace-updated', handleWorkspaceUpdated);
  }, [revalidator]);

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

  // Sorting state (matching desktop)
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

  const optionsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(optionsRef, () => setOptionsOpen(false));

  const { isScrolling, handleScroll } = useScrollbarFade();

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
    const folder = folders.find(item => item.id === folderId);
    const nextExpanded = !(expandedFolders[folderId] ?? folder?.isExpanded ?? true);
    fetch(`/api/folders/${folderId}/toggle`, {
      method: 'POST',
      body: new URLSearchParams({ isExpanded: String(nextExpanded) }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        window.dispatchEvent(new CustomEvent('omp:workspace-updated', {
          detail: { folderId },
        }));
      })
      .catch((error: unknown) => {
        console.error('Failed to save mobile workspace state:', error);
      });
  };

  useEffect(() => {
    setExpandedFolders(Object.fromEntries(folders.map(folder => [folder.id, folder.isExpanded])));
  }, [folders]);

  const handleSelectSession = (id: number | string) => {
    onSelectSession(id);
    onClose();
  };

  const handleNewSessionAndClose = () => {
    onNewSession();
    onClose();
  };

  const handleToggleArchived = () => {
    setShowArchived(!showArchived);
    setOptionsOpen(false);
  };

  // Filter and sort folders/sessions
  const processedFolders = useMemo(() => {
    let result = folders.map(folder => {
      if (!searchQuery.trim()) return folder;
      const query = searchQuery.toLowerCase();
      const matchesFolderName = folder.name.toLowerCase().includes(query);
      const filteredSessions = (folder.sessions || []).filter(s =>
        s.title.toLowerCase().includes(query)
      );
      if (matchesFolderName) return folder;
      return { ...folder, sessions: filteredSessions };
    }).filter(f => !searchQuery.trim() || f.sessions && f.sessions.length > 0);

    // Ordering is shared with the desktop sidebar so the two cannot drift.
    return sortFolders(result, sortOption);
  }, [folders, searchQuery, sortOption]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-ink relative select-none">
      
      <MobileSessionHeader onClose={onClose} />

      <MobileSessionToolbar
        searchQuery={searchQuery}
        sortOption={sortOption}
        optionsOpen={optionsOpen}
        showArchived={showArchived}
        optionsRef={optionsRef}
        onNewSession={handleNewSessionAndClose}
        onNewWorkspace={() => setNewWorkspaceOpen(true)}
        onScheduler={() => setSchedulerOpen(true)}
        onToggleOptions={() => setOptionsOpen(!optionsOpen)}
        onSortChange={handleSortChange}
        onResetSort={() => handleSortChange('A-Z')}
        onToggleArchived={handleToggleArchived}
        onHideArchived={() => setShowArchived(false)}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
      />

      <MobileSessionList
        folders={processedFolders}
        activeSessionId={activeSessionId}
        expandedFolders={expandedFolders}
        showArchived={showArchived}
        sessionStatus={sessionStatus}
        isScrolling={isScrolling}
        onScroll={handleScroll}
        onSelectSession={handleSelectSession}
        onToggleFolder={toggleFolder}
      />

      <MobileSessionFooter
        onSettings={() => window.dispatchEvent(new CustomEvent('omp:open-settings', { detail: {} }))}
        onAbout={() => setAboutOpen(true)}
        onDesktopToggle={onDesktopToggle}
        updateAvailable={updates.hasUpdate}
        onUpdateClick={() => {
          setAboutOpen(true);
          void updates.check();
        }}
      />

      {/* Reusable Modals */}
      <NewWorkspaceModal
        isOpen={newWorkspaceOpen}
        onClose={() => setNewWorkspaceOpen(false)}
        onCreate={onCreateFolder}
      />
      <SchedulerModal
        isOpen={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
      />
      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
        updates={updates}
        onToast={pushToast}
      />

      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}

    </div>
  );
}
