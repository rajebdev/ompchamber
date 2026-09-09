import { useState, useRef } from 'react';
import { Plus, MoreHorizontal, Pin, PinOff, Trash2, Archive, ArchiveRestore, Loader2, Check, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export function SessionItem({ title, isActive = false, isArchived = false, status, onClick, onArchive }: { title: string, isActive?: boolean, isArchived?: boolean, status?: 'processing' | 'done', onClick?: () => void, onArchive?: () => void }) {
  return (
    <div
      className={`group/item flex items-center rounded cursor-pointer ${isActive ? 'bg-ink/10 font-medium text-ink' : 'text-ink/60'}`}
    >
      <div className="w-[14px] flex-shrink-0 flex items-center justify-center">
        {status === 'processing' && (
          <Loader2 size={12} className="text-ink/50 animate-spin" />
        )}
        {status === 'done' && (
          <Check size={12} className="text-ink/50" />
        )}
      </div>
      <div 
        onClick={onClick}
        className={`flex-1 text-xs truncate px-1.5 py-1.5 ${isActive ? '' : 'hover:text-ink/80'}`}
      >
        {title.charAt(0).toUpperCase() + title.slice(1)}
      </div>
      {onArchive && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          title={isArchived ? 'Unarchive session' : 'Archive session'}
          className="flex-shrink-0 p-1 mr-1 text-ink/30 hover:text-ink rounded opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer"
        >
          {isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
        </button>
      )}
    </div>
  );
}

export function Category({ 
  folder, 
  activeSessionId, 
  onSelectSession,
  onNewSessionForFolder,
  forceExpanded = false,
  showArchived = false,
  sessionStatus = {}
}: { 
  folder: any;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (id: number) => void;
  forceExpanded?: boolean;
  showArchived?: boolean;
  sessionStatus?: Record<string, 'processing' | 'done'>;
}) {
  const [isOpen, setIsOpen] = useState(folder.isExpanded || false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleFetcher = useFetcher();
  const pinFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const archiveFetcher = useFetcher();
  const revalidator = useRevalidator();

  useOnClickOutside(menuRef, () => {
    setShowMenu(false);
    setConfirmDelete(false);
  });

  const allSessions = folder.sessions;

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState); // optimistic UI update
    if (typeof folder.id !== 'number') {
      // Real folders are omp-bound: expansion state is kept client-side only
      // (no workspace_folders row to persist to for string ids).
      return;
    }
    toggleFetcher.submit(
      { isExpanded: String(nextState) },
      { method: 'POST', action: `/api/folders/${folder.id}/toggle` }
    );
  };

  const handlePin = () => {
    if (typeof folder.id !== 'number') return;
    pinFetcher.submit(
      { isPinned: String(!folder.isPinned) },
      { method: 'POST', action: `/api/folders/${folder.id}/pin` }
    );
    setShowMenu(false);
    revalidator.revalidate();
  };

  const handleDelete = () => {
    if (typeof folder.id !== 'number') return;
    deleteFetcher.submit(
      {},
      { method: 'POST', action: `/api/folders/${folder.id}/delete` }
    );
    setShowMenu(false);
    setConfirmDelete(false);
    revalidator.revalidate();
  };

  const handleArchive = (session: any) => {
    const nextArchived = session.is_archived !== 1;
    archiveFetcher.submit(
      { archived: String(nextArchived) },
      { method: 'POST', action: `/api/sessions/${session.id}/archive` }
    );
    revalidator.revalidate();
  };

  const isActuallyOpen = forceExpanded || isOpen;

  const visibleSessions = (allSessions || []).filter((s: any) =>
    showArchived ? s.is_archived === 1 : s.is_archived !== 1
  );

  // Show 5 sessions initially; each "View more" click reveals 7 more.
  const renderedSessions = visibleSessions.slice(0, visibleCount);
  const hasMore = visibleSessions.length > visibleCount;

  return (
    <div className="space-y-1">
      <div 
        className="group flex items-center justify-between text-[13px] font-semibold text-ink/90 px-1 py-0.5 hover:bg-ink/5 rounded transition-colors"
      >
        <div className="flex-1 flex items-center space-x-1.5 cursor-pointer" onClick={handleToggle}>
          <Folder size={14} className={`flex-shrink-0 group-hover:hidden ${isActuallyOpen ? 'text-ink' : 'text-ink/50'}`} />
          {isActuallyOpen ? (
            <ChevronDown size={14} className="hidden group-hover:block flex-shrink-0 text-ink" />
          ) : (
            <ChevronRight size={14} className="hidden group-hover:block flex-shrink-0 text-ink/50" />
          )}
          {folder.isPinned && <Pin size={11} className="text-ink/50" />}
          <span>{folder.name}</span>
        </div>
        
        {/* Hover Actions */}
        <div className={`items-center space-x-1 pr-1 ${showMenu ? 'flex' : 'hidden group-hover:flex'}`}>
          <Plus 
            size={12} 
            className="text-ink/40 hover:text-ink cursor-pointer"  
            onClick={(e) => { e.stopPropagation(); onNewSessionForFolder(folder.id); }}
          />
          <div className="relative" ref={menuRef}>
            <MoreHorizontal 
              size={12} 
              className="text-ink/40 hover:text-ink cursor-pointer" 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            />
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1">
                {confirmDelete ? (
                  <>
                    <div className="px-3 py-1.5 text-xs text-ink/80">Delete workspace?</div>
                    <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-red-600" onClick={handleDelete}>
                      <Trash2 size={12} /><span>Yes, delete</span>
                    </div>
                    <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2" onClick={() => setConfirmDelete(false)}>
                      <span>Cancel</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2" onClick={handlePin}>
                      {folder.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                      <span>{folder.isPinned ? 'Unpin Workspace' : 'Pin Workspace'}</span>
                    </div>
                    <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-red-600" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={12} /><span>Delete Workspace</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isActuallyOpen && visibleSessions.length > 0 && (
        <div className="space-y-0.5 ml-1">
          {renderedSessions.map((session: any) => {
            const isActive = activeSessionId !== null 
              ? String(activeSessionId) === String(session.id)
              : session.is_active === 1;

            return (
              <SessionItem 
                key={session.id} 
                title={session.title} 
                isActive={isActive} 
                isArchived={session.is_archived === 1}
                status={sessionStatus[String(session.id)]}
                onClick={() => onSelectSession(session.id)}
                onArchive={() => handleArchive(session)}
              />
            );
          })}
          {hasMore && !forceExpanded && (
            <button 
              onClick={() => setVisibleCount(c => c + 7)}
              className="text-[10px] font-medium text-ink/60 hover:text-ink w-full text-left flex items-center space-x-1"
            >
              <span className="w-[14px] flex-shrink-0"></span>
              <span className="px-1.5 py-1.5">View more sessions...</span>
            </button>
          )}
          {visibleSessions.length === 0 && (
            <div className="px-4 py-1.5 text-[10px] text-ink/40 italic">
              {showArchived ? 'No archived sessions.' : 'No sessions.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
