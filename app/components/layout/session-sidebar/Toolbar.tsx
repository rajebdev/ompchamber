import { Search, FolderPlus, Calendar, Archive, MoreHorizontal, PanelLeftClose, X } from 'lucide-react';
import type { SessionSortOption } from '@/types';

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
  onClose,
}: SessionSidebarToolbarProps) {
  return (
    <div className="p-3 border-b border-ink/10 flex flex-col space-y-3">
      <div className="flex items-center justify-between px-1 text-ink/60">
        <div className="flex space-x-3 items-center">
          <FolderPlus size={14} className="hover:text-ink cursor-pointer"  onClick={onNewWorkspace} />
          <Calendar size={14} className="hover:text-ink cursor-pointer" onClick={onScheduler} />
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
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-ink/40 tracking-wider">Sort Workspaces</div>
                <div 
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'A-Z' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                  onClick={() => onSortChange('A-Z')}
                >
                  <span>A-Z</span>
                  {sortOption === 'A-Z' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                </div>
                <div 
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'Z-A' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                  onClick={() => onSortChange('Z-A')}
                >
                  <span>Z-A</span>
                  {sortOption === 'Z-A' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                </div>
                <div 
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'LATEST_SESSION' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                  onClick={() => onSortChange('LATEST_SESSION')}
                >
                  <span>Latest Session</span>
                  {sortOption === 'LATEST_SESSION' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                </div>
                <div 
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'LATEST_ADDED' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                  onClick={() => onSortChange('LATEST_ADDED')}
                >
                  <span>Latest Added</span>
                  {sortOption === 'LATEST_ADDED' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                </div>
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
            onChange={(e) => onSearchChange(e.target.value)}
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
