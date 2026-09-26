import { useRef, useState } from 'preact/hooks';
import { ChevronDown, ChevronRight, GitBranch, MessageSquare, MoreHorizontal, Plus } from 'lucide-preact';
import { useSearchParams } from '@/client/lib/router/search-params';
import { MobileSessionRow } from '@/client/components/mobile/mobile-session-sidebar/SessionRow';
import { SubagentList } from '@/client/components/common/subagent-list';
import { WorkspaceOptionsMenu } from '@/client/components/common/workspace-options-menu';
import { useShowMore } from '@/client/hooks/ui/show-more';
import { useExpandedSessions } from '@/client/hooks/workspace/expanded-sessions';
import { useWorkspaceFolderActions } from '@/client/hooks/workspace/workspace-folder-actions';
import { getProjectIcon } from '@/shared/lib/workspace/project-icon';
import { relativeTimeAgo } from '@/shared/lib/workspace/relative-time';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';
import type { WorkspaceFolderData } from '@/shared/types';

interface MobileSessionCategoryProps {
  folder: WorkspaceFolderData;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (folderId: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showArchived?: boolean;
  sessionStatus?: Record<string, 'stream' | 'finish' | 'abort'>;
}

export function MobileSessionCategory({
  folder,
  activeSessionId,
  onSelectSession,
  onNewSessionForFolder,
  isExpanded,
  onToggleExpand,
  showArchived = false,
  sessionStatus = {}
}: MobileSessionCategoryProps) {
  const { visibleCount, showMore } = useShowMore();
  const { refresh } = useSidebarData();
  const { expandedSessionIds, toggleSession } = useExpandedSessions();
  // The viewed transcript, so its session row dims while a roster entry is
  // open (desktop parity — same params, same rule).
  const [searchParams] = useSearchParams();
  const urlSubagentId = searchParams.get('subagent');
  const urlSessionId = searchParams.get('sessionId');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    confirmDelete,
    requestDelete,
    cancelDelete,
    handlePin,
    handleDelete,
    handleArchive,
    handleRename,
  } = useWorkspaceFolderActions(folder, refresh);

  useOnClickOutside(menuRef, () => {
    setShowMenu(false);
    cancelDelete();
  });

  const onPin = () => {
    handlePin();
    setShowMenu(false);
  };

  const onDelete = () => {
    handleDelete();
    setShowMenu(false);
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
        className="flex items-center justify-between pl-4 pr-3 py-2 cursor-pointer hover:bg-ink/5 rounded-lg select-none transition-colors"
      >
        <div className="flex items-center space-x-2 min-w-0">
          {/* The folder glyph occupies the same 16px left slot the session rows
              give their roster toggle, so the two columns line up down the
              drawer — the icon, the chevron and every row's status glyph share
              one x. Desktop gets this from one shared slot; the drawer's
              padding is what differs, hence the matching `pl-4`. */}
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {folder.customIconUrl ? (
              <img
                src={folder.customIconUrl}
                alt=""
                className="w-[15px] h-[15px] rounded-xs object-contain"
                referrerPolicy="no-referrer"
              />
            ) : folder.iconType === 'chat' ? (
              <MessageSquare size={15} className="text-ink/80" />
            ) : (
              <ProjectIcon
                size={15}
                className="text-ink/80"
                style={{ color: folder.accentColor || undefined }}
              />
            )}
          </span>

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

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNewSessionForFolder(folder.id);
            }}
            className="p-1.5 rounded-lg hover:bg-ink/10 active:bg-ink/15 text-ink/60 hover:text-ink"
            title="New Session"
            aria-label={`New session in ${folder.name}`}
          >
            <Plus size={15} />
          </button>

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
                <WorkspaceOptionsMenu
                  variant="mobile"
                  isPinned={folder.isPinned}
                  confirmDelete={confirmDelete}
                  onPin={onPin}
                  onDelete={onDelete}
                  onRequestDelete={requestDelete}
                  onCancelDelete={cancelDelete}
                />
              </div>
            )}
          </div>

          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {visibleSessions.map((session) => {
            const sessionKey = String(session.id);
            const isSessionActive = String(activeSessionId) === sessionKey;
            // While one of its subagents is being viewed, the parent session
            // row dims so the highlighted roster entry reads as the active one
            // (desktop parity).
            const isViewingSubagent = isSessionActive && urlSessionId === sessionKey && Boolean(urlSubagentId);
            // Same gate as desktop: the omp-side loader flag is authoritative,
            // so a session whose roster exists on disk can be opened without a
            // live process.
            const hasSubagents = Boolean(session.hasSubagents);
            const isRosterOpen = hasSubagents && expandedSessionIds.has(sessionKey);

            return (
              <div key={session.id} className="space-y-0.5">
                <MobileSessionRow
                  session={session}
                  isActive={isSessionActive && !isViewingSubagent}
                  status={sessionStatus[sessionKey]}
                  timeAgo={relativeTimeAgo(session.updated_at ?? session.created_at)}
                  hasSubagents={hasSubagents}
                  isExpanded={isRosterOpen}
                  onToggleExpand={() => toggleSession(sessionKey)}
                  onSelect={() => onSelectSession(session.id)}
                  onArchive={() => handleArchive(session)}
                  onRename={sessionKey.startsWith('new-') ? undefined : (name) => void handleRename(session, name)}
                />
                {isRosterOpen && (
                  <SubagentList
                    sessionId={session.id}
                    isActiveSession={isSessionActive}
                    className="ml-2"
                  />
                )}
              </div>
            );
          })}

          {filteredSessions.length > visibleCount && (
            <button
              type="button"
              onClick={showMore}
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
