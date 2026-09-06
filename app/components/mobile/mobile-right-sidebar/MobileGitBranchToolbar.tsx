import React, { useState, useRef } from 'react';
import { 
  GitBranch, 
  ChevronDown, 
  Check, 
  Plus, 
  History, 
  GitMerge, 
  MoreHorizontal,
  FolderTree,
  List
} from 'lucide-react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface MobileGitBranchToolbarProps {
  branch: string;
  branches: string[];
  onBranchChange: (branch: string) => void;
  onOpenBranchPrompt: () => void;
  onHistory: () => void;
  onGraph: () => void;
  viewMode: 'flat' | 'tree';
  setViewMode: (mode: 'flat' | 'tree') => void;
}

export function MobileGitBranchToolbar({
  branch,
  branches,
  onBranchChange,
  onOpenBranchPrompt,
  onHistory,
  onGraph,
  viewMode,
  setViewMode
}: MobileGitBranchToolbarProps) {
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const branchRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(branchRef, () => setShowBranchMenu(false));
  useOnClickOutside(optionsRef, () => setShowOptionsMenu(false));

  return (
    <div className="p-3 border-b border-[#141310]/10 bg-[#f4f1ea]/50 flex items-center justify-between flex-shrink-0">
      {/* Branch Menu with Create new branch */}
      <div className="relative" ref={branchRef}>
        <button
          type="button"
          onClick={() => setShowBranchMenu(!showBranchMenu)}
          className="flex items-center space-x-1.5 hover:bg-[#141310]/5 px-2 py-1 -ml-2 rounded transition-colors text-[11px] text-[#141310]/80 font-medium"
        >
          <GitBranch size={12} className="text-[#141310]/60" />
          <span className="truncate max-w-[140px]">{branch}</span>
          <ChevronDown size={12} className="text-[#141310]/40" />
        </button>

        {showBranchMenu && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-[#faf8f3] border border-[#141310]/20 rounded-md shadow-lg z-50 flex flex-col overflow-hidden text-xs">
            <div className="max-h-48 overflow-y-auto py-1">
              {branches.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    onBranchChange(b);
                    setShowBranchMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#141310]/5 flex items-center justify-between transition-colors"
                >
                  <span className="truncate">{b}</span>
                  {branch === b && <Check size={12} className="text-[#141310]" />}
                </button>
              ))}
              <div className="w-full h-px bg-[#141310]/10 my-1" />
              <button
                type="button"
                onClick={() => {
                  onOpenBranchPrompt();
                  setShowBranchMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors text-[#141310]/80 italic"
              >
                <Plus size={12} />
                <span>Create new branch...</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick ViewMode Toggle, History, Graph, and View Options buttons */}
      <div className="flex items-center space-x-2 text-[#141310]/40 relative" ref={optionsRef}>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'flat' ? 'tree' : 'flat')}
          title={viewMode === 'flat' ? 'Switch to Tree View' : 'Switch to List View'}
          className={`p-1 rounded hover:text-[#141310] hover:bg-[#141310]/5 cursor-pointer transition-colors ${
            viewMode === 'tree' ? 'text-[#141310] bg-[#141310]/5' : ''
          }`}
        >
          {viewMode === 'flat' ? <FolderTree size={13} /> : <List size={13} />}
        </button>

        <button
          type="button"
          onClick={onHistory}
          title="Commit History"
          className="p-1 rounded hover:text-[#141310] hover:bg-[#141310]/5 cursor-pointer transition-colors"
        >
          <History size={13} />
        </button>
        <button
          type="button"
          onClick={onGraph}
          title="Git Graph"
          className="p-1 rounded hover:text-[#141310] hover:bg-[#141310]/5 cursor-pointer transition-colors"
        >
          <GitMerge size={13} />
        </button>
        <button
          type="button"
          onClick={() => setShowOptionsMenu(!showOptionsMenu)}
          title="View Options"
          className="p-1 rounded hover:text-[#141310] hover:bg-[#141310]/5 cursor-pointer transition-colors"
        >
          <MoreHorizontal size={13} />
        </button>

        {showOptionsMenu && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-[#faf8f3] border border-[#141310]/15 rounded-md shadow-lg z-50 py-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => { setViewMode('flat'); setShowOptionsMenu(false); }}
              className="w-full px-3 py-1.5 text-left text-[#141310] hover:bg-[#141310]/5 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <List size={12} className="text-[#141310]/60" />
                <span>View as List</span>
              </div>
              {viewMode === 'flat' && <Check size={12} className="text-[#141310]" />}
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('tree'); setShowOptionsMenu(false); }}
              className="w-full px-3 py-1.5 text-left text-[#141310] hover:bg-[#141310]/5 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <FolderTree size={12} className="text-[#141310]/60" />
                <span>View as Tree</span>
              </div>
              {viewMode === 'tree' && <Check size={12} className="text-[#141310]" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
