import { useEffect, useRef, useState } from 'preact/hooks';
import { MoreHorizontal, Pin, Plus } from 'lucide-preact';
import { useSearchParams } from '@/client/lib/router/search-params';
import { useFetcher } from '@/client/lib/router/fetcher';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { useShowMore } from '@/client/hooks/ui/show-more';
import { useWorkspaceFolderActions } from '@/client/hooks/workspace/workspace-folder-actions';
import { SessionItem } from '@/client/components/layout/session-sidebar/SessionItem';
import { SubagentList } from '@/client/components/layout/session-sidebar/SubagentList';
import { WorkspaceOptionsMenu } from '@/client/components/common/workspace-options-menu';
import { loadExpandedSessionIds, saveExpandedSessionIds } from '@/shared/lib/workspace/sidebar-expanded';
import { getProjectIcon } from '@/shared/lib/workspace/project-icon';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';

export { SessionItem };

export function Category({ 
  folder, 
  activeSessionId, 
  onSelectSession,
  onNewSessionForFolder,
  forceExpanded = false,
  showArchived = false,
  sessionStatus = {},
}: { 
  folder: any;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (id: number) => void;
  forceExpanded?: boolean;
  showArchived?: boolean;
  sessionStatus?: Record<string, 'stream' | 'finish' | 'abort'>;
}) {
  const [isOpen, setIsOpen] = useState(folder.isExpanded || false);
  const [showMenu, setShowMenu] = useState(false);
  const { visibleCount, showMore } = useShowMore();
  const [searchParams] = useSearchParams();
  const urlSubagentId = searchParams.get('subagent');
  const urlSessionId = searchParams.get('sessionId');
  
  // Sidebar-level expanded session set
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const saved = loadExpandedSessionIds();
    if (saved && saved.size > 0) {
      setExpandedSessionIds(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof folder.isExpanded === 'boolean') setIsOpen(folder.isExpanded);
  }, [folder.isExpanded]);

  // A deep-linked transcript (?sessionId=…&subagent=…) auto-expands its
  // session row so the viewed roster entry is visible after a reload.
  useEffect(() => {
    if (!urlSubagentId || !urlSessionId) return;
    setExpandedSessionIds(prev => {
      if (prev.has(urlSessionId)) return prev;
      const next = new Set(prev);
      next.add(urlSessionId);
      return next;
    });
  }, [urlSubagentId, urlSessionId]);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const { refresh } = useSidebarData();
  const toggleFetcher = useFetcher<{ success?: boolean }>();
  const {
    confirmDelete,
    requestDelete,
    cancelDelete,
    handlePin,
    handleDelete,
    handleArchive,
    handleRename,
  } = useWorkspaceFolderActions(folder, refresh);

  // Desktop's expand toggle keeps its own fetcher: unlike pin/delete it
  // dispatches on the *response* (not immediately) and carries no folderId.
  useEffect(() => {
    if (toggleFetcher.data?.success) {
      window.dispatchEvent(new CustomEvent('omp:workspace-updated'));
    }
  }, [toggleFetcher.data]);

  useOnClickOutside(menuRef, () => {
    setShowMenu(false);
    cancelDelete();
  });

  const allSessions = folder.sessions;
  const ProjectIcon = getProjectIcon(folder.icon);

  const toggleFolder = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (typeof folder.id !== 'number') {
      return;
    }
    toggleFetcher.submit(
      { isExpanded: String(nextState) },
      { method: 'POST', action: `/api/folders/${folder.id}/toggle` }
    );
  };

  const handleToggleSessionExpand = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      saveExpandedSessionIds(next);
      return next;
    });
  };

  const onPin = () => {
    handlePin();
    setShowMenu(false);
  };

  const onDelete = () => {
    handleDelete();
    setShowMenu(false);
  };

  const isActuallyOpen = forceExpanded || isOpen;

  const visibleSessions = (allSessions || []).filter((s: any) =>
    showArchived ? s.is_archived === 1 : s.is_archived !== 1
  );

  const renderedSessions = visibleSessions.slice(0, visibleCount);
  const hasMore = visibleSessions.length > visibleCount;

  return (
    <div className="space-y-1">
      {/* Folder Header */}
      <div 
        className="group flex items-center justify-between h-7 text-xs font-semibold text-ink px-2 hover:bg-ink/5 rounded-md transition-colors select-none"
      >
        <div className="flex-1 h-full flex items-center cursor-pointer min-w-0" onClick={toggleFolder}>
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {folder.customIconUrl ? (
              <img
                src={folder.customIconUrl}
                alt=""
                className="w-[15px] h-[15px] rounded-xs object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <ProjectIcon
                size={15}
                className="text-ink/75"
                style={{ color: folder.accentColor || undefined }}
              />
            )}
          </span>
          <span className="w-2 shrink-0" />
          {folder.isPinned && <Pin size={11} className="text-ink/60 shrink-0 mr-1.5" />}
          <span className="truncate text-[13px] font-semibold tracking-tight">{folder.name}</span>
        </div>
        
        {/* Workspace Actions (Hover) */}
        <div className={`items-center space-x-0.5 pl-1 ${showMenu ? 'flex' : 'hidden group-hover:flex'}`}>
          <button
            type="button"
            title="New Session"
            className="w-5 h-5 flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/10 rounded cursor-pointer transition-colors"
            onClick={(e) => { e.stopPropagation(); onNewSessionForFolder(folder.id); }}
          >
            <Plus size={12} />
          </button>
          
          <div className="relative flex items-center" ref={menuRef}>
            <button
              type="button"
              title="Workspace Options"
              className="w-5 h-5 flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/10 rounded cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            >
              <MoreHorizontal size={12} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-paper border border-ink/15 rounded-md shadow-lg z-50 py-1 text-xs">
                <WorkspaceOptionsMenu
                  variant="desktop"
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
        </div>
      </div>
      
      {/* Sessions List */}
      {isActuallyOpen && (
        <div className="space-y-0.5">
          {renderedSessions.map((session: any) => {
            const sessionKey = String(session.id);
            const isActive = activeSessionId !== null
              ? String(activeSessionId) === sessionKey
              : session.is_active === 1;
            // While one of its subagents is being viewed, the parent session
            // row dims so the highlighted roster entry reads as the active one.
            const isViewingSubagent = isActive && urlSessionId === sessionKey && Boolean(urlSubagentId);
            const canExpandActive = activeSessionId !== null && sessionKey === String(activeSessionId);
            // Chevron gate comes straight from the omp-side loader flag
            // (disk scan + transcript recovery); the client never overrides it.
            const hasSubagents = Boolean(session.hasSubagents);
            const isExpanded = hasSubagents && expandedSessionIds.has(sessionKey);

            return (
              <div key={session.id} className="space-y-0.5">
                <SessionItem
                  title={session.title}
                  isActive={isActive && !isViewingSubagent}
                  isArchived={session.is_archived === 1}
                  status={sessionStatus[sessionKey]}
                  awaitingInput={Boolean(session.awaitingInput)}
                  onClick={() => onSelectSession(session.id)}
                  onArchive={() => handleArchive(session)}
                  onRename={String(session.id).startsWith('new-') ? undefined : (name) => void handleRename(session, name)}
                  expandable={hasSubagents}
                  hasSubagents={hasSubagents}
                  isExpanded={isExpanded}
                  onToggleExpand={() => handleToggleSessionExpand(sessionKey)}
                />
                {hasSubagents && isExpanded && (
                  <SubagentList sessionId={session.id} isActiveSession={canExpandActive} />
                )}
              </div>
            );
          })}

          {/* Show more sessions Button */}
          {hasMore && !forceExpanded && (
            <button 
              type="button"
              onClick={showMore}
              className="flex items-center text-xs text-ink/45 hover:text-ink/80 w-full text-left py-1.5 px-2 rounded-lg hover:bg-ink/5 transition-colors cursor-pointer select-none"
            >
              <span className="w-4 h-4 shrink-0" />
              <span className="w-2 shrink-0" />
              <span className="truncate leading-snug">Show more sessions</span>
            </button>
          )}

          {visibleSessions.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-ink/40 italic">
              {showArchived ? 'No archived sessions.' : 'No sessions.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
