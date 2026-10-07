import { MobileSessionCategory } from '@/client/components/mobile/mobile-session-sidebar/Item';
import { useScrollbarFadeRef } from '@/client/hooks/ui/scrollbar-fade';
import type { WorkspaceFolderData } from '@/shared/types';

interface MobileSessionListProps {
  folders: WorkspaceFolderData[];
  activeSessionId: number | string | null;
  expandedFolders: Record<number, boolean>;
  showArchived: boolean;
  sessionStatus: Record<string, 'stream' | 'finish' | 'abort'>;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (folderId: number) => void;
  onToggleFolder: (folderId: number) => void;
  /** Surfaces a refused folder action (the reveal endpoint's own reason). */
  onToast?: (message: string, type?: 'success' | 'error') => void;
}

export function MobileSessionList({
  folders,
  activeSessionId,
  expandedFolders,
  showArchived,
  sessionStatus,
  onSelectSession,
  onNewSessionForFolder,
  onToggleFolder,
  onToast,
}: MobileSessionListProps) {
  // The list owns the scroller, so it owns the fade class — driving it from the
  // parent re-rendered every session row on every scroll event.
  const fade = useScrollbarFadeRef();
  return (
    <div 
      ref={fade.ref}
      onScroll={fade.onScroll}
      className="flex-1 scrollbar-overlay-container p-3"
    >
      {folders.length === 0 ? (
        <div className="text-center py-12 text-xs text-ink/50 italic">
          No matching sessions found
        </div>
      ) : (
        folders.map(folder => (
          <MobileSessionCategory
            key={folder.id}
            folder={folder}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSessionForFolder={onNewSessionForFolder}
            isExpanded={expandedFolders[folder.id] ?? true}
            onToggleExpand={() => onToggleFolder(folder.id)}
            showArchived={showArchived}
            sessionStatus={sessionStatus}
            onToast={onToast}
          />
        ))
      )}
    </div>
  );
}
