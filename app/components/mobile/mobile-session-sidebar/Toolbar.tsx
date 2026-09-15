import type { RefObject } from 'react';
import { 
  Search, 
  Plus, 
  FolderPlus, 
  Calendar, 
  Archive, 
  ArrowUpDown, 
  Check,
  X
} from 'lucide-react';
import type { SessionSortOption } from '@/types';

interface MobileSessionToolbarProps {
  searchQuery: string;
  sortOption: SessionSortOption;
  optionsOpen: boolean;
  showArchived: boolean;
  optionsRef: RefObject<HTMLDivElement | null>;
  onNewSession: () => void;
  onNewWorkspace: () => void;
  onScheduler: () => void;
  onToggleOptions: () => void;
  onSortChange: (opt: SessionSortOption) => void;
  onResetSort: () => void;
  onToggleArchived: () => void;
  onHideArchived: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
}

export function MobileSessionToolbar({
  searchQuery,
  sortOption,
  optionsOpen,
  showArchived,
  optionsRef,
  onNewSession,
  onNewWorkspace,
  onScheduler,
  onToggleOptions,
  onSortChange,
  onResetSort,
  onToggleArchived,
  onHideArchived,
  onSearchChange,
  onClearSearch,
}: MobileSessionToolbarProps) {
  return (
    <div className="p-3 border-b border-ink/10 flex flex-col space-y-2.5 flex-shrink-0 bg-canvas">
      {/* Row 1: Primary + New Session Button & Quick Utility Buttons */}
      <div className="flex items-center space-x-2">
        {/* Large Ergonomic New Session Button */}
        <button
          type="button"
          onClick={onNewSession}
          className="flex-1 h-9.5 flex items-center justify-center space-x-2 px-3.5 rounded-xl bg-ink text-canvas hover:bg-ink/90 active:scale-[0.98] text-xs font-semibold transition-all shadow-xs"
        >
          <Plus size={15} strokeWidth={2.4} />
          <span>New Session</span>
        </button>

        {/* New Workspace / Folder button */}
        <button
          type="button"
          onClick={onNewWorkspace}
          className="w-9.5 h-9.5 rounded-xl border border-ink/15 bg-paper hover:bg-ink/5 active:scale-95 text-ink/80 hover:text-ink flex items-center justify-center transition-all flex-shrink-0 cursor-pointer shadow-xs"
          title="New Workspace"
          aria-label="New Workspace"
        >
          <FolderPlus size={16} strokeWidth={1.8} />
        </button>

        {/* Scheduler button */}
        <button
          type="button"
          onClick={onScheduler}
          className="w-9.5 h-9.5 rounded-xl border border-ink/15 bg-paper hover:bg-ink/5 active:scale-95 text-ink/80 hover:text-ink flex items-center justify-center transition-all flex-shrink-0 cursor-pointer shadow-xs"
          title="Schedule Task"
          aria-label="Schedule Task"
        >
          <Calendar size={16} strokeWidth={1.8} />
        </button>

        {/* Sort & Filter Dropdown */}
        <div className="relative flex-shrink-0" ref={optionsRef}>
          <button
            type="button"
            onClick={onToggleOptions}
            className={`w-9.5 h-9.5 rounded-xl border active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-xs ${
              optionsOpen || sortOption !== 'A-Z' || showArchived
                ? 'bg-ink/10 text-ink border-ink/30' 
                : 'border-ink/15 bg-paper hover:bg-ink/5 text-ink/80 hover:text-ink'
            }`}
            title="Sort & Filter"
            aria-label="Sort & Filter"
          >
            <ArrowUpDown size={15} strokeWidth={1.8} />
          </button>

          {optionsOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-paper border border-ink/15 rounded-xl shadow-xl z-50 p-2 text-xs">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-ink/40 font-mono">Sort Workspaces</div>
              {(['A-Z', 'Z-A', 'LATEST_SESSION', 'LATEST_ADDED'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSortChange(opt)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                    sortOption === opt 
                      ? 'bg-ink/10 font-semibold text-ink' 
                      : 'hover:bg-ink/5 text-ink/80'
                  }`}
                >
                  <span>{opt.replace('_', ' ')}</span>
                  {sortOption === opt && <Check size={13} className="text-ink" />}
                </button>
              ))}

              <div className="border-t border-ink/10 my-1.5"></div>

              <div className="px-2 py-1 text-[10px] uppercase font-bold text-ink/40 font-mono">Filter</div>
              <button
                type="button"
                onClick={onToggleArchived}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                  showArchived 
                    ? 'bg-amber-500/15 text-amber-950 font-semibold' 
                    : 'hover:bg-ink/5 text-ink/80'
                }`}
              >
                <span className="flex items-center space-x-1.5">
                  <Archive size={13} />
                  <span>Show Archived</span>
                </span>
                {showArchived && <Check size={13} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Search Input Bar */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-3 text-ink/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search workspaces & sessions..."
          className="w-full bg-paper border border-ink/15 rounded-xl pl-8 pr-8 py-2 text-xs text-ink placeholder-ink/40 focus:outline-none focus:border-ink/40 transition-colors font-mono"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2.5 text-ink/40 hover:text-ink p-1"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Row 3: Active Filters Pills (if sort or archive changed from defaults) */}
      {(showArchived || sortOption !== 'A-Z') && (
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 pt-0.5">
          {sortOption !== 'A-Z' && (
            <span className="inline-flex items-center space-x-1 bg-ink/5 border border-ink/10 text-ink/80 rounded-lg px-2 py-0.5 text-[10px] font-mono">
              <span>Sort: {sortOption.replace('_', ' ')}</span>
              <button 
                type="button" 
                onClick={onResetSort} 
                className="hover:text-ink ml-0.5"
                title="Reset sort"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {showArchived && (
            <span className="inline-flex items-center space-x-1 bg-amber-500/15 border border-amber-500/25 text-amber-900 rounded-lg px-2 py-0.5 text-[10px] font-mono">
              <Archive size={10} />
              <span>Archived</span>
              <button 
                type="button" 
                onClick={onHideArchived} 
                className="hover:text-amber-950 ml-0.5"
                title="Hide archived"
              >
                <X size={10} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
