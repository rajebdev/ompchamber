import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  GitBranch,
} from 'lucide-react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { MobileSessionRow } from '@/components/mobile/mobile-session-sidebar/SessionRow';
import { getProjectIcon } from '@/lib/workspace/project-icon';
import { relativeTimeAgo } from '@/lib/workspace/relative-time';
import type { WorkspaceFolderData, SessionItemData } from '@/types';

interface MobileSessionCategoryProps {
  folder: WorkspaceFolderData;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showArchived?: boolean;
  sessionStatus?: Record<string, 'processing' | 'done'>;
}

const INITIAL_VISIBLE = 5;
const VISIBLE_STEP = 7;

export function MobileSessionCategory({
  folder,
  activeSessionId,
  onSelectSession,
  isExpanded,
  onToggleExpand,
  showArchived = false,
  sessionStatus = {}
}: MobileSessionCategoryProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
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

  // Archived rows are filtered first; the badge reports the visible set so the
  // count always matches what the list can actually show.
  const filteredSessions = (folder.sessions || []).filter((s) =>
    showArchived ? s.is_archived === 1 : s.is_archived !== 1
  );
  const visibleSessions = filteredSessions.slice(0, visibleCount);
  const ProjectIcon = getProjectIcon(folder.icon);

  return (
    <div className="mb-4">
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
          ) : folder.iconType === 'chat' ? (
            <MessageSquare size={15} className="text-ink/80 flex-shrink-0" />
          ) : (
            <ProjectIcon
              size={15}
              className="text-ink/80 flex-shrink-0"
              style={{ color: folder.accentColor || undefined }}
            />
          )}

          <span className="text-sm font-semibold text-ink truncate">
            {folder.name}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs text-ink/60">
          <span className="font-mono text-[11px] text-ink/70">
            {filteredSessions.length}
          </span>

          {folder.project_path && (
            <GitBranch size={13} className="text-ink/50 ml-1" />
          )}

          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {visibleSessions.map((session) => (
            <MobileSessionRow
              key={session.id}
              session={session}
              isActive={String(activeSessionId) === String(session.id)}
              status={sessionStatus[String(session.id)]}
              timeAgo={relativeTimeAgo(session.updated_at ?? session.created_at)}
              onSelect={() => onSelectSession(session.id)}
              onArchive={() => handleArchive(session)}
              onRename={String(session.id).startsWith('new-') ? undefined : (name) => void handleRename(session, name)}
            />
          ))}

          {filteredSessions.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + VISIBLE_STEP)}
              className="w-full text-left px-3 py-2 text-xs text-ink/60 hover:text-ink flex items-center space-x-1.5"
            >
              <ChevronDown size={12} className="w-4 flex-shrink-0" />
              <span>Show more sessions ({filteredSessions.length - visibleCount})</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
