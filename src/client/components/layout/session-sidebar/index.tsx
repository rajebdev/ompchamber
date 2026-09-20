import { useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import { AboutModal, NewWorkspaceModal, SchedulerModal, SettingsModal } from '@/client/components/layout/session-sidebar/Modals';
import { SessionSidebarHeader } from '@/client/components/layout/session-sidebar/Header';
import { SessionSidebarToolbar } from '@/client/components/layout/session-sidebar/Toolbar';
import { SessionSidebarFooter } from '@/client/components/layout/session-sidebar/Footer';
import { SessionSidebarSessionList } from '@/client/components/layout/session-sidebar/SessionList';
import { SessionListSkeleton } from '@/client/components/layout/session-sidebar/Skeleton';
import { ToastStack } from '@/client/components/common/ToastStack';
import { spawnCwdForNewSession, triggerSessionPrewarm } from '@/shared/lib/omp/session/prewarm';
import { useScrollbarFade } from '@/client/hooks/ui/scrollbar-fade';
import { useToasts } from '@/client/hooks/ui/toasts';
import { useUpdates } from '@/client/hooks/ui/updates';
import { useSessionSidebarController } from '@/client/hooks/chat/omp/session-sidebar-controller';

export function SessionSidebar({ className = '', onClose, appSettings = {} }: { className?: string, onClose?: () => void, appSettings?: Record<string, any> }) {
  const {
    folders,
    initializing,
    refresh,
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
  } = useSessionSidebarController(appSettings, { includePendingSessions: true });
  const [, setSearchParams] = useSearchParams();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Modals for new workspace and scheduler
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const updates = useUpdates();
  const { toasts, pushToast, dismissToast } = useToasts();

  // Sidebar inline states
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const { isScrolling, handleScroll } = useScrollbarFade();

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
          onRefresh={refresh}
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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
