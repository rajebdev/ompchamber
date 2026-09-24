import { useEffect, useRef, useState } from 'preact/hooks';
import { MobileSessionHeader } from '@/client/components/mobile/mobile-session-sidebar/Header';
import { MobileSessionToolbar } from '@/client/components/mobile/mobile-session-sidebar/Toolbar';
import { MobileSessionList } from '@/client/components/mobile/mobile-session-sidebar/List';
import { MobileSessionFooter } from '@/client/components/mobile/mobile-session-sidebar/Footer';
import { ToastStack } from '@/client/components/common/ToastStack';
import { AboutModal, NewWorkspaceModal, SchedulerModal } from '@/client/components/layout/session-sidebar/Modals';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { useScrollbarFade } from '@/client/hooks/ui/scrollbar-fade';
import { useToasts } from '@/client/hooks/ui/toasts';
import { useUpdates } from '@/client/hooks/ui/updates';
import { useSessionSidebarController } from '@/client/hooks/chat/omp/session-sidebar-controller';
import { MobileSessionListSkeleton } from '@/client/components/mobile/mobile-session-sidebar/Skeleton';

interface MobileSessionSidebarProps {
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSession: () => void;
  onNewSessionForFolder: (folderId: number) => void;
  onCreateFolder: (input: { name: string; path?: string }) => Promise<void> | void;
  onClose: () => void;
  onDesktopToggle?: () => void;
  appSettings?: Record<string, any>;
}

export function MobileSessionSidebar({
  activeSessionId,
  onSelectSession,
  onNewSession,
  onNewSessionForFolder,
  onCreateFolder,
  onClose,
  onDesktopToggle,
  appSettings = {}
}: MobileSessionSidebarProps) {
  const {
    folders,
    initializing,
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
  } = useSessionSidebarController(appSettings, { onSelectSession, onAfterSelect: onClose });

  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true
  });

  // Modals state (matching desktop)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const updates = useUpdates();
  const { toasts, pushToast, dismissToast } = useToasts();

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

  const handleNewSessionAndClose = () => {
    onNewSession();
    onClose();
  };

  // Same dismissal as the toolbar's New Session: the pending session is opened
  // behind the drawer, so the user must land on the chat, not on the list.
  const handleNewSessionForFolderAndClose = (folderId: number) => {
    onNewSessionForFolder(folderId);
    onClose();
  };

  const handleToggleArchived = () => {
    setShowArchived(!showArchived);
    setOptionsOpen(false);
  };

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

      {initializing ? (
        <MobileSessionListSkeleton />
      ) : (
        <MobileSessionList
          folders={processedFolders}
          activeSessionId={activeSessionId}
          expandedFolders={expandedFolders}
          showArchived={showArchived}
          sessionStatus={sessionStatus}
          isScrolling={isScrolling}
          onScroll={handleScroll}
          onSelectSession={handleSelectSession}
          onNewSessionForFolder={handleNewSessionForFolderAndClose}
          onToggleFolder={toggleFolder}
        />
      )}

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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
}
