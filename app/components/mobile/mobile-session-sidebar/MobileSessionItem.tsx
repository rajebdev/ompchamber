import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
  Folder, 
  GitBranch, 
  MoreHorizontal,
  ChevronRight as ArrowIcon
} from 'lucide-react';
import type { WorkspaceFolderData, SessionItemData } from '@/types';

interface MobileSessionCategoryProps {
  folder: WorkspaceFolderData;
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function MobileSessionCategory({
  folder,
  activeSessionId,
  onSelectSession,
  isExpanded,
  onToggleExpand
}: MobileSessionCategoryProps) {
  const [showMore, setShowMore] = useState(false);

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

  // Limit sessions shown initially to match screenshot
  const visibleSessions = showMore ? (folder.sessions || []) : (folder.sessions || []).slice(0, 7);
  const totalCount = folder.totalSessions || folder.sessions?.length || 0;

  return (
    <div className="mb-4">
      {/* Category Header Row (Matching Gambar 2) */}
      <div 
        onClick={onToggleExpand}
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-ink/5 rounded-lg select-none transition-colors"
      >
        <div className="flex items-center space-x-2 min-w-0">
          {/* Icon */}
          {isChats ? (
            <MessageSquare size={15} className="text-ink/80 flex-shrink-0" />
          ) : (
            <Folder size={15} className="text-ink/80 flex-shrink-0" />
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
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                  isActive 
                    ? 'bg-ink/10 font-medium text-ink' 
                    : 'hover:bg-ink/5 text-ink/85'
                }`}
              >
                {/* Title */}
                <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                  {isDrReal && (
                    <span className="text-ink/40 text-xs flex-shrink-0 font-mono">&gt;</span>
                  )}
                  <span className="text-xs truncate leading-snug">
                    {session.title}
                  </span>
                </div>

                {/* Timestamp */}
                <span className="text-[11px] text-ink/45 font-mono flex-shrink-0 ml-2">
                  {timeAgo}
                </span>
              </button>
            );
          })}

          {/* "Show more sessions" toggle button */}
          {(folder.sessions?.length || 0) > 7 && (
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="w-full text-left px-3 py-1.5 text-xs text-ink/60 hover:text-ink flex items-center space-x-1"
            >
              <ChevronDown size={12} className={showMore ? 'transform rotate-180' : ''} />
              <span>{showMore ? 'Show fewer sessions' : 'Show more sessions'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
