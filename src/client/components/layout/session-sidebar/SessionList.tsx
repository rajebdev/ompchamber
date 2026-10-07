import { Category } from '@/client/components/layout/session-sidebar/CategoryItem';
import { useScrollbarFadeRef } from '@/client/hooks/ui/scrollbar-fade';

interface SessionSidebarSessionListProps {
  folders: any[];
  activeSessionId: number | string | null;
  searchQuery: string;
  showArchived: boolean;
  sessionStatus: Record<string, 'stream' | 'finish' | 'abort'>;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (id: number) => void;
  /** Surfaces a refused folder action (the reveal endpoint's own reason). */
  onToast?: (message: string, type?: 'success' | 'error') => void;
}

export function SessionSidebarSessionList({
  folders,
  activeSessionId,
  searchQuery,
  showArchived,
  sessionStatus,
  onSelectSession,
  onNewSessionForFolder,
  onToast,
}: SessionSidebarSessionListProps) {
  // The fade is the scroller's own concern: the list owns the element, so it
  // owns the class toggle. Driving it from the parent re-rendered every session
  // row on every scroll event.
  const fade = useScrollbarFadeRef();
  return (
    <div 
      ref={fade.ref}
      onScroll={fade.onScroll}
      className="flex-1 scrollbar-overlay-container p-2 space-y-4"
    >
      {folders.length === 0 ? (
        <div className="text-center py-8 text-xs text-ink/40">
          {searchQuery ? 'No results found.' : 'No workspaces available.'}
        </div>
      ) : (
        folders.map(folder => (
          <Category 
            key={folder.id} 
            folder={folder} 
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSessionForFolder={onNewSessionForFolder}
            forceExpanded={!!searchQuery}
            showArchived={showArchived}
            sessionStatus={sessionStatus}
            onToast={onToast}
          />
        ))
      )}
    </div>
  );
}
