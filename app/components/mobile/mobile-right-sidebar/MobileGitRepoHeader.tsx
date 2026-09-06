import React, { useState, useRef } from 'react';
import { FolderGit2, ChevronDown, RotateCcw, Check } from 'lucide-react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface MobileGitRepoHeaderProps {
  repos: string[];
  activeRepo: string;
  isLoading: boolean;
  onSelectRepo: (repo: string) => void;
  onRefresh: () => void;
}

export function MobileGitRepoHeader({
  repos,
  activeRepo,
  isLoading,
  onSelectRepo,
  onRefresh
}: MobileGitRepoHeaderProps) {
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const repoRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(repoRef, () => setShowRepoMenu(false));

  return (
    <div className="p-3 border-b border-[#141310]/10 flex items-center justify-between bg-[#f4f1ea] flex-shrink-0">
      <div className="relative" ref={repoRef}>
        <button
          type="button"
          onClick={() => setShowRepoMenu(!showRepoMenu)}
          className="flex items-center space-x-1.5 hover:bg-[#141310]/5 px-2 py-1 -ml-1.5 rounded transition-colors text-xs text-[#141310]/80 font-medium cursor-pointer"
        >
          <FolderGit2 size={12} className="text-[#141310]/60" />
          <span className="flex items-center space-x-1 truncate max-w-[150px]">
            <span className="text-[#141310]/50 font-normal uppercase tracking-wider text-[10px]">GIT</span>
            <span className="text-[#141310]/30">•</span>
            <span>{activeRepo === '.' ? 'workspace root' : activeRepo.split('/').pop()}</span>
          </span>
          <ChevronDown size={12} className="text-[#141310]/40" />
        </button>

        {/* Detected Git Repositories Dropdown */}
        {showRepoMenu && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-[#faf8f3] border border-[#141310]/20 rounded-md shadow-lg z-50 flex flex-col overflow-hidden text-xs">
            <div className="max-h-48 overflow-y-auto py-1">
              {repos.length === 0 ? (
                <div className="px-3 py-2 text-[#141310]/40 italic">No repos found</div>
              ) : (
                repos.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onSelectRepo(r);
                      setShowRepoMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#141310]/5 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate">{r === '.' ? 'workspace root' : r}</span>
                    {activeRepo === r && <Check size={12} className="text-[#141310]" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex space-x-2 text-[#141310]/40">
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh"
          className="hover:text-[#141310] cursor-pointer inline-flex p-1 rounded"
        >
          <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
