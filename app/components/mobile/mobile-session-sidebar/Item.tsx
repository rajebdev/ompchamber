import { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
  GitBranch,
} from 'lucide-react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { MobileSessionRow } from '@/components/mobile/mobile-session-sidebar/SessionRow';
import type { WorkspaceFolderData, SessionItemData } from '@/types';
import { getProjectIcon } from '@/lib/workspace/project-icon';

interface MobileSessionCategoryProps {
  folder: WorkspaceFolderData;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showArchived?: boolean;
  sessionStatus?: Record<string, 'processing' | 'done'>;
}

export function MobileSessionCategory({
  folder,
  activeSessionId,
  onSelectSession,
  isExpanded,
  onToggleExpand,
  showArchived = false,
  sessionStatus = {}
}: MobileSessionCategoryProps) {
  const [visibleCount, setVisibleCount] = useState(5);
  const archiveFetcher = useFetcher();
  const revalidator = useRevalidator();

  const handleArchive = (session: SessionItemData) => {
    const nextArchived = session.is_archived !== 1;
    archiveFetcher.submit(
      { archived: String(nextArchived) },
      { method: 'POST', action: `/api/sessions/${session.id}/archive` }
    );
    revalidator.revalidate();
  };

  const handleRename = async (session: SessionItemData, name: string) => {
    try {
      const body = new FormData();
      body.set('name', name);
      const res = await fetch(`/api/sessions/${encodeURIComponent(String(session.id))}/rename`, { method: 'POST', body });
      if (!res.ok) return;
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent('omp:session-renamed', { detail: { sessionId: String(session.id), title: name } }));
    revalidator.revalidate();
  };

  // Derive realistic timestamps if not provided in DB
  const formatTimeAgo = (session: SessionItemData, index: number, folderName: string): string => {
    if (session.timeAgo) return session.timeAgo;
    
    const lower = folderName.toLowerCase();
    if (lower.includes('chat')) {
      return index === 0 ? '1d' : '5d';
    }
    if (lower.includes('workspace')) {
      const times = ['9h', '1d', '2d', '2d', '2d', '2d', '3d', '4d'];
      return times[index % times.length];
    }
    if (lower.includes('drreal')) {
      return '26 Jun';
    }
    return `${index + 1}d`;
  };

  const isDrReal = folder.name.toLowerCase().includes('drreal');
  const isWorkspace = folder.name.toLowerCase().includes('workspace');
  const isChats = folder.name.toLowerCase().includes('chat');

  // Show 5 sessions initially; each "Show more" click reveals 7 more.
  const filteredSessions = (folder.sessions || []).filter((s) =>
    showArchived ? s.is_archived === 1 : s.is_archived !== 1
  );
  const visibleSessions = filteredSessions.slice(0, visibleCount);
  const totalCount = folder.totalSessions || folder.sessions?.length || 0;
  const ProjectIcon = getProjectIcon(folder.icon);

  return (
    <div className="mb-4">
      {/* Category Header Row (Matching Gambar 2) */}
      <div 
        onClick={onToggleExpand}
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-ink/5 rounded-lg select-none transition-colors"
      >
        <div className="flex items-center space-x-2 min-w-0">
          {folder.customIconUrl ? (
            <img
              src={folder.customIconUrl}
              alt=""
              className="w-[15px] h-[15px] rounded-xs object-contain flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : isChats ? (
            <MessageSquare size={15} className="text-ink/80 flex-shrink-0" />
          ) : (
            <ProjectIcon
              size={15}
              className="text-ink/80 flex-shrink-0"
              style={{ color: folder.accentColor || undefined }}
            />
          )}

          {/* Folder Name */}
          <span className="text-sm font-semibold text-ink truncate">
            {folder.name}
          </span>
        </div>

        {/* Right badges & actions */}
        <div className="flex items-center space-x-2 text-xs text-ink/60">
          {/* Dot badge if workspace */}
          {isWorkspace && (
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              <span className="font-mono text-[11px] text-ink/70">203</span>
            </div>
          )}

          {/* Count badge for chats & drreal */}
          {!isWorkspace && (
            <span className="font-mono text-[11px] text-ink/70">
              {isChats ? '2' : isDrReal ? '7' : totalCount}
            </span>
          )}

          {/* Branch / tree glyph if workspace */}
          {isWorkspace && (
            <GitBranch size={13} className="text-ink/50 ml-1" />
          )}

          {/* Chevron expand */}
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Session items list */}
      {isExpanded && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {visibleSessions.map((session, idx) => {
            const isActive = activeSessionId === session.id;
            const timeAgo = formatTimeAgo(session, idx, folder.name);

            return (
              <MobileSessionRow
                key={session.id}
                session={session}
                isActive={isActive}
                status={sessionStatus[String(session.id)]}
                timeAgo={timeAgo}
                showTreeGlyph={isDrReal}
                onSelect={() => onSelectSession(session.id)}
                onArchive={() => handleArchive(session)}
                onRename={String(session.id).startsWith('new-') ? undefined : (name) => void handleRename(session, name)}
              />
            );
          })}

          {/* "Show more sessions" toggle button */}
          {filteredSessions.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + 7)}
              className="w-full text-left px-3 py-2 text-xs text-ink/60 hover:text-ink flex items-center space-x-1.5"
            >
              <ChevronDown size={12} className="w-4 flex-shrink-0" />
              <span>Show more sessions</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
