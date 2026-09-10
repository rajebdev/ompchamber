import { MobileSessionCategory } from '@/components/mobile/mobile-session-sidebar/Item';
import type { WorkspaceFolderData } from '@/types';

interface MobileSessionListProps {
  folders: WorkspaceFolderData[];
  activeSessionId: number | string | null;
  expandedFolders: Record<number, boolean>;
  showArchived: boolean;
  sessionStatus: Record<string, 'processing' | 'done'>;
  isScrolling: boolean;
  onScroll: () => void;
  onSelectSession: (id: number | string) => void;
  onToggleFolder: (folderId: number) => void;
}

export function MobileSessionList({
  folders,
  activeSessionId,
  expandedFolders,
  showArchived,
  sessionStatus,
  isScrolling,
  onScroll,
  onSelectSession,
  onToggleFolder,
}: MobileSessionListProps) {
  return (
    <div 
      onScroll={onScroll}
      className={`flex-1 scrollbar-overlay-container p-3 ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}
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
            isExpanded={expandedFolders[folder.id] ?? true}
            onToggleExpand={() => onToggleFolder(folder.id)}
            showArchived={showArchived}
            sessionStatus={sessionStatus}
          />
        ))
      )}
    </div>
  );
}
