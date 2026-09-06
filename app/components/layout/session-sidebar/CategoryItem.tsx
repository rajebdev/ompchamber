import React, { useState } from 'react';
import { Plus, MoreHorizontal, Pin, Trash2 } from 'lucide-react';
import { useFetcher } from '@remix-run/react';

export function SessionItem({ title, isActive = false, onClick }: { title: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`text-xs truncate px-3 py-1.5 rounded cursor-pointer ${isActive ? 'bg-[#141310]/10 font-medium text-[#141310]' : 'text-[#141310]/60 hover:bg-[#141310]/5 hover:text-[#141310]/80'}`}
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
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSessionForFolder: (id: number) => void;
  forceExpanded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(folder.isExpanded || false);
  const [showMenu, setShowMenu] = useState(false);
  const fetcher = useFetcher<any>();
  const toggleFetcher = useFetcher();
  
  const allSessions = fetcher.data?.sessions || folder.sessions;
  const hasMore = !fetcher.data?.sessions && folder.hasMore;
  
  const handleViewMore = () => {
    fetcher.load(`/api/sessions/${folder.id}`);
  };

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState); // optimistic UI update
    toggleFetcher.submit(
      { isExpanded: String(nextState) },
      { method: 'POST', action: `/api/folders/${folder.id}/toggle` }
    );
  };

  const isActuallyOpen = forceExpanded || isOpen;

  return (
    <div className="space-y-1">
      <div 
        className="group flex items-center justify-between text-[13px] font-semibold text-[#141310]/90 px-1 py-0.5 hover:bg-[#141310]/5 rounded transition-colors"
      >
        <div className="flex-1 flex items-center space-x-1.5 cursor-pointer" onClick={handleToggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isActuallyOpen ? 'rotate-90 text-[#141310]' : 'text-[#141310]/50'}`}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span>{folder.name}</span>
        </div>
        
        {/* Hover Actions */}
        <div className="hidden group-hover:flex items-center space-x-1 pr-1" onMouseLeave={() => setShowMenu(false)}>
          <Plus 
            size={12} 
            className="text-[#141310]/40 hover:text-[#141310] cursor-pointer"  
            onClick={(e) => { e.stopPropagation(); onNewSessionForFolder(folder.id); }}
          />
          <div className="relative">
            <MoreHorizontal 
              size={12} 
              className="text-[#141310]/40 hover:text-[#141310] cursor-pointer" 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            />
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#faf8f3] border border-[#141310]/10 rounded shadow-lg z-50 py-1">
                <div className="px-3 py-1.5 text-xs hover:bg-[#141310]/5 cursor-pointer flex items-center space-x-2">
                  <Pin size={12} /><span>Pin Workspace</span>
                </div>
                <div className="px-3 py-1.5 text-xs hover:bg-[#141310]/5 cursor-pointer flex items-center space-x-2 text-red-600">
                  <Trash2 size={12} /><span>Delete Workspace</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isActuallyOpen && allSessions?.length > 0 && (
        <div className="space-y-0.5 ml-2 border-l border-[#141310]/10 pl-1">
          {allSessions.map((session: any) => {
            const isActive = activeSessionId !== null 
              ? activeSessionId === session.id 
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
              className="text-[10px] font-medium text-[#141310]/60 hover:text-[#141310] px-4 py-1.5 w-full text-left flex items-center space-x-1"
            >
              {fetcher.state === 'loading' ? 'Loading...' : 'View more sessions...'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
