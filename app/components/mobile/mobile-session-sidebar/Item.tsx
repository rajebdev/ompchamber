import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  GitBranch,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { MobileSessionRow } from '@/components/mobile/mobile-session-sidebar/SessionRow';
import { getProjectIcon } from '@/lib/workspace/project-icon';
import { relativeTimeAgo } from '@/lib/workspace/relative-time';
import { useOnClickOutside } from '@/hooks/ui/on-click-outside';
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
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pinFetcher = useFetcher<{ success?: boolean }>();
  const deleteFetcher = useFetcher<{ success?: boolean }>();

  useOnClickOutside(menuRef, () => {
    setShowMenu(false);
    setConfirmDelete(false);
  });

  useEffect(() => {
    if (pinFetcher.data?.success || deleteFetcher.data?.success) {
      window.dispatchEvent(new CustomEvent('omp:workspace-updated'));
    }
  }, [deleteFetcher.data, pinFetcher.data]);

  const handlePin = () => {
    if (typeof folder.id !== 'number') return;
    pinFetcher.submit(
      { isPinned: String(!folder.isPinned) },
      { method: 'POST', action: `/api/folders/${folder.id}/pin` },
    );
    setShowMenu(false);
    revalidator.revalidate();
  };

  const handleDelete = () => {
    if (typeof folder.id !== 'number') return;
    deleteFetcher.submit(
      {},
      { method: 'POST', action: `/api/folders/${folder.id}/delete` },
    );
    setShowMenu(false);
    setConfirmDelete(false);
    revalidator.revalidate();
  };

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

          <div className="relative flex items-center" ref={menuRef} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowMenu(value => !value);
              }}
              className="p-1.5 rounded-lg hover:bg-ink/10 active:bg-ink/15 text-ink/60 hover:text-ink"
              title="Workspace options"
              aria-label={`Options for ${folder.name}`}
            >
              <MoreHorizontal size={15} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-paper border border-ink/15 rounded-lg shadow-lg z-50 py-1 text-xs">
                {confirmDelete ? (
                  <>
                    <div className="px-3 py-2 text-ink/80 font-medium">Delete workspace?</div>
                    <button type="button" onClick={handleDelete} className="w-full text-left px-3 py-2 hover:bg-error/10 text-error flex items-center space-x-2">
                      <Trash2 size={13} />
                      <span>Yes, delete</span>
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="w-full text-left px-3 py-2 hover:bg-ink/5 text-ink/70">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={handlePin} className="w-full text-left px-3 py-2 hover:bg-ink/5 text-ink/80 flex items-center space-x-2">
                      {folder.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                      <span>{folder.isPinned ? 'Unpin Workspace' : 'Pin Workspace'}</span>
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-left px-3 py-2 hover:bg-error/10 text-error flex items-center space-x-2">
                      <Trash2 size={13} />
                      <span>Delete Workspace</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

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
