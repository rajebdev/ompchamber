import { Category } from '@/components/layout/session-sidebar/CategoryItem';

interface SessionSidebarSessionListProps {
  folders: any[];
  activeSessionId: number | string | null;
  searchQuery: string;
  showArchived: boolean;
  sessionStatus: Record<string, 'stream' | 'finish' | 'abort' | 'error'>;
  isScrolling: boolean;
  onScroll: () => void;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (id: number) => void;
}

export function SessionSidebarSessionList({
  folders,
  activeSessionId,
  searchQuery,
  showArchived,
  sessionStatus,
  isScrolling,
  onScroll,
  onSelectSession,
  onNewSessionForFolder,
}: SessionSidebarSessionListProps) {
  return (
    <div 
      onScroll={onScroll}
      className={`flex-1 scrollbar-overlay-container p-2 space-y-4 ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}
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
          />
        ))
      )}
    </div>
  );
}
