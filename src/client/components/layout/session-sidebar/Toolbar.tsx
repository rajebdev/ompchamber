import { Archive, Calendar, FolderPlus, MoreHorizontal, PanelLeftClose, RefreshCw, Search, X } from 'lucide-preact';
import type { SessionSortOption } from '@/shared/types';
import { SortMenu } from '@/client/components/common/sort-menu';

interface SessionSidebarToolbarProps {
  isSearchVisible: boolean;
  searchQuery: string;
  showArchived: boolean;
  optionsOpen: boolean;
  sortOption: SessionSortOption;
  onToggleSearch: () => void;
  onSearchChange: (value: string) => void;
  onToggleArchived: () => void;
  onHideArchived: () => void;
  onToggleOptions: () => void;
  onCloseOptions: () => void;
  onSortChange: (opt: SessionSortOption) => void;
  onNewWorkspace: () => void;
  onScheduler: () => void;
  onRefresh: () => void;
  onClose?: () => void;
}

export function SessionSidebarToolbar({
  isSearchVisible,
  searchQuery,
  showArchived,
  optionsOpen,
  sortOption,
  onToggleSearch,
  onSearchChange,
  onToggleArchived,
  onHideArchived,
  onToggleOptions,
  onCloseOptions,
  onSortChange,
  onNewWorkspace,
  onScheduler,
  onRefresh,
  onClose,
}: SessionSidebarToolbarProps) {
  return (
    <div className="p-3 border-b border-ink/10 flex flex-col space-y-3">
      <div className="flex items-center justify-between px-1 text-ink/60">
        <div className="flex space-x-3 items-center">
          <FolderPlus size={14} className="hover:text-ink cursor-pointer"  onClick={onNewWorkspace} />
          <Calendar size={14} className="hover:text-ink cursor-pointer" onClick={onScheduler} />
          <span 
            title="Refresh sessions" 
            onClick={onRefresh}
            className="inline-flex cursor-pointer"
          >
            <RefreshCw 
              size={14} 
              className="hover:text-ink" 
            />
          </span>
        </div>
        <div className="flex space-x-3 items-center relative">
          <Search 
            size={14} 
            className={`cursor-pointer transition-colors ${isSearchVisible ? 'text-ink' : 'hover:text-ink'}`} 
             
            onClick={onToggleSearch} 
          />
          <span 
            title={showArchived ? "Hide Archive" : "Show Archive"} 
            onClick={onToggleArchived}
            className="inline-flex cursor-pointer"
          >
            <Archive 
              size={14} 
              className={`transition-colors ${showArchived ? 'text-ink' : 'hover:text-ink'}`} 
            />
          </span>
          
          <div className="relative">
            <MoreHorizontal 
              size={14} 
              className={`cursor-pointer transition-colors ${optionsOpen ? 'text-ink' : 'hover:text-ink'}`} 
               
              onClick={onToggleOptions} 
            />
            {optionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1" onMouseLeave={onCloseOptions}>
                <SortMenu variant="desktop" sortOption={sortOption} onSortChange={onSortChange} />
              </div>
            )}
          </div>

          <PanelLeftClose size={14} className="hover:text-ink cursor-pointer ml-1" onClick={onClose} />
        </div>
      </div>
      
      {/* Search Field */}
      {isSearchVisible && (
        <div className="pt-1">
          <input 
            type="text" 
            placeholder="Search workspaces & sessions..." 
            value={searchQuery}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            autoFocus
            className="w-full bg-ink/5 border border-ink/10 rounded px-2.5 py-1.5 outline-none focus:border-ink/30 text-xs text-ink placeholder-ink/40 transition-colors" 
          />
        </div>
      )}
      
      {/* Archive Status Pill */}
      {showArchived && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 text-amber-900 rounded px-2.5 py-1.5 text-[10px] font-medium">
          <div className="flex items-center space-x-1.5">
            <Archive size={10} />
            <span>Showing Archived</span>
          </div>
          <button className="hover:text-amber-950" onClick={onHideArchived}>
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
