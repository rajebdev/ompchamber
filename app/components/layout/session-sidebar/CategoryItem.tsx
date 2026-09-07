import React, { useState } from 'react';
import { Plus, MoreHorizontal, Pin, Trash2 } from 'lucide-react';
import { useFetcher } from '@remix-run/react';

export function SessionItem({ title, isActive = false, onClick }: { title: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`text-xs truncate px-3 py-1.5 rounded cursor-pointer ${isActive ? 'bg-ink/10 font-medium text-ink' : 'text-ink/60 hover:bg-ink/5 hover:text-ink/80'}`}
    >
      {title}
    </div>
  );
}

export function Category({ 
  folder, 
  activeSessionId, 
  onSelectSession,
  onNewSessionForFolder,
  forceExpanded = false
}: { 
  folder: any;
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSessionForFolder: (id: number) => void;
  forceExpanded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(folder.isExpanded || false);
  const [showMenu, setShowMenu] = useState(false);
  const fetcher = useFetcher<any>();
  const toggleFetcher = useFetcher();
  
  const allSessions = fetcher.data?.sessions || folder.sessions;
  // Real-mode folders carry every session already; only mock folders (which
  // may have a numeric "View more" pagination) trigger the fetcher route.
  const hasMore = !fetcher.data?.sessions && folder.hasMore && typeof folder.id === 'number';
  
  const handleViewMore = () => {
    fetcher.load(`/api/sessions/${folder.id}`);
  };

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

  const isActuallyOpen = forceExpanded || isOpen;

  return (
    <div className="space-y-1">
      <div 
        className="group flex items-center justify-between text-[13px] font-semibold text-ink/90 px-1 py-0.5 hover:bg-ink/5 rounded transition-colors"
      >
        <div className="flex-1 flex items-center space-x-1.5 cursor-pointer" onClick={handleToggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isActuallyOpen ? 'rotate-90 text-ink' : 'text-ink/50'}`}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span>{folder.name}</span>
        </div>
        
        {/* Hover Actions */}
        <div className="hidden group-hover:flex items-center space-x-1 pr-1" onMouseLeave={() => setShowMenu(false)}>
          <Plus 
            size={12} 
            className="text-ink/40 hover:text-ink cursor-pointer"  
            onClick={(e) => { e.stopPropagation(); onNewSessionForFolder(folder.id); }}
          />
          <div className="relative">
            <MoreHorizontal 
              size={12} 
              className="text-ink/40 hover:text-ink cursor-pointer" 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            />
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1">
                <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2">
                  <Pin size={12} /><span>Pin Workspace</span>
                </div>
                <div className="px-3 py-1.5 text-xs hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-red-600">
                  <Trash2 size={12} /><span>Delete Workspace</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isActuallyOpen && allSessions?.length > 0 && (
        <div className="space-y-0.5 ml-2 border-l border-ink/10 pl-1">
          {allSessions.map((session: any) => {
            const isActive = activeSessionId !== null 
              ? String(activeSessionId) === String(session.id)
              : session.is_active === 1;

            return (
              <SessionItem 
                key={session.id} 
                title={session.title} 
                isActive={isActive} 
                onClick={() => onSelectSession(session.id)}
              />
            );
          })}
          {hasMore && !forceExpanded && (
            <button 
              onClick={handleViewMore}
              disabled={fetcher.state === 'loading'}
              className="text-[10px] font-medium text-ink/60 hover:text-ink px-4 py-1.5 w-full text-left flex items-center space-x-1"
            >
              {fetcher.state === 'loading' ? 'Loading...' : 'View more sessions...'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
