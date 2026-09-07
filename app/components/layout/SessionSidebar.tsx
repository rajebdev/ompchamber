import React, { useState, useMemo } from 'react';
import { Plus, Search, Settings, Info, FolderPlus, Calendar, Archive, MoreHorizontal, PanelLeftClose, X } from 'lucide-react';
import { useSearchParams } from '@remix-run/react';
import { SettingsModal, AboutModal, NewWorkspaceModal, SchedulerModal } from './session-sidebar/SidebarModals';
import { Category } from './session-sidebar/CategoryItem';

export function SessionSidebar({ className = '', folders = [], onClose, appSettings = {} }: { className?: string, folders?: any[], onClose?: () => void, appSettings?: Record<string, any> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');
  const activeSessionId = sessionParam ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam)) : null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  
  // Modals for new workspace and scheduler
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  
  // Sidebar inline states
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  // Options dropdown state
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortOption, setSortOption] = useState<'A-Z' | 'Z-A' | 'LATEST_SESSION' | 'LATEST_ADDED'>('A-Z');

  const handleSelectSession = (id: number | string) => {
    setSearchParams(prev => {
      prev.set('sessionId', id.toString());
      return prev;
    }, { replace: true });
  };

  const handleNewSession = () => {
    setSearchParams(prev => {
      const currentSessionId = prev.get('sessionId');
      prev.delete('sessionId');
      if (currentSessionId) {
        const currentFolder = folders.find(f => f.sessions?.some((s: any) => String(s.id) === String(currentSessionId)));
        if (currentFolder) {
          prev.set('folderId', currentFolder.id.toString());
        }
      } else {
        prev.delete('folderId');
      }
      return prev;
    }, { replace: true });
  };

  const handleNewSessionForFolder = (folderId: number) => {
    setSearchParams(prev => {
      prev.delete('sessionId');
      prev.set('folderId', folderId.toString());
      return prev;
    }, { replace: true });
  };

  // Filter and sort folders
  const processedFolders = useMemo(() => {
    let result = [...folders];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(folder => {
        const matchFolder = folder.name.toLowerCase().includes(q);
        const matchSession = folder.sessions?.some((s: any) => s.title.toLowerCase().includes(q));
        return matchFolder || matchSession;
      }).map(folder => {
        // If we are searching, we also filter the sessions within the folder
        const filteredSessions = folder.sessions?.filter((s: any) => 
          folder.name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        );
        return { ...folder, sessions: filteredSessions, isExpanded: true };
      });
    }

    // Sort folders
    result.sort((a, b) => {
      switch (sortOption) {
        case 'A-Z':
          return a.name.localeCompare(b.name);
        case 'Z-A':
          return b.name.localeCompare(a.name);
        case 'LATEST_SESSION':
          // Assuming higher session id means latest for this demo
          const maxIdA = a.sessions?.length ? Math.max(...a.sessions.map((s: any) => s.id)) : 0;
          const maxIdB = b.sessions?.length ? Math.max(...b.sessions.map((s: any) => s.id)) : 0;
          return maxIdB - maxIdA;
        case 'LATEST_ADDED':
          // Assuming higher folder id means latest added
          return b.id - a.id;
        default:
          return 0;
      }
    });

    return result;
  }, [folders, searchQuery, sortOption]);

  return (
    <>
      <aside className={`flex flex-col bg-paper h-full ${className}`}>
        {/* New Session Button */}
        <div className="px-3 pt-3">
          <button 
            onClick={handleNewSession}
            className="w-full flex items-center justify-center space-x-2 py-2 bg-ink text-canvas rounded text-xs font-semibold hover:bg-ink/90 transition-colors"
          >
            <Plus size={14} />
            <span>New Session</span>
          </button>
        </div>

        {/* Top Actions */}
        <div className="p-3 border-b border-ink/10 flex flex-col space-y-3">
          <div className="flex items-center justify-between px-1 text-ink/60">
            <div className="flex space-x-3 items-center">
              <FolderPlus size={14} className="hover:text-ink cursor-pointer"  onClick={() => setNewWorkspaceOpen(true)} />
              <Calendar size={14} className="hover:text-ink cursor-pointer" onClick={() => setSchedulerOpen(true)} />
            </div>
            <div className="flex space-x-3 items-center relative">
              <Search 
                size={14} 
                className={`cursor-pointer transition-colors ${isSearchVisible ? 'text-ink' : 'hover:text-ink'}`} 
                 
                onClick={() => setIsSearchVisible(!isSearchVisible)} 
              />
              <span 
                title={showArchived ? "Hide Archive" : "Show Archive"} 
                onClick={() => setShowArchived(!showArchived)}
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
                   
                  onClick={() => setOptionsOpen(!optionsOpen)} 
                />
                {optionsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1" onMouseLeave={() => setOptionsOpen(false)}>
                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-ink/40 tracking-wider">Sort Workspaces</div>
                    <div 
                      className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'A-Z' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                      onClick={() => { setSortOption('A-Z'); setOptionsOpen(false); }}
                    >
                      <span>A-Z</span>
                      {sortOption === 'A-Z' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                    </div>
                    <div 
                      className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'Z-A' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                      onClick={() => { setSortOption('Z-A'); setOptionsOpen(false); }}
                    >
                      <span>Z-A</span>
                      {sortOption === 'Z-A' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                    </div>
                    <div 
                      className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'LATEST_SESSION' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                      onClick={() => { setSortOption('LATEST_SESSION'); setOptionsOpen(false); }}
                    >
                      <span>Latest Session</span>
                      {sortOption === 'LATEST_SESSION' && <div className="w-1.5 h-1.5 rounded-full bg-ink"></div>}
                    </div>
                    <div 
                      className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between ${sortOption === 'LATEST_ADDED' ? 'bg-ink/5 text-ink font-medium' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
                      onClick={() => { setSortOption('LATEST_ADDED'); setOptionsOpen(false); }}
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
              <button className="hover:text-amber-950" onClick={() => setShowArchived(false)}>
                <X size={10} />
              </button>
            </div>
          )}
        </div>
        
        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {processedFolders.length === 0 ? (
            <div className="text-center py-8 text-xs text-ink/40">
              {searchQuery ? 'No results found.' : 'No workspaces available.'}
            </div>
          ) : (
            processedFolders.map(folder => (
              <Category 
                key={folder.id} 
                folder={folder} 
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewSessionForFolder={handleNewSessionForFolder}
                forceExpanded={!!searchQuery}
              />
            ))
          )}
        </div>

        {/* Bottom Bar */}
        <div className="p-3 border-t border-ink/10 flex items-center justify-between text-ink/60 shrink-0">
          <div className="flex space-x-3">
            <Settings size={16} className="hover:text-ink cursor-pointer" onClick={() => setSettingsOpen(true)} />
            <Info size={16} className="hover:text-ink cursor-pointer" onClick={() => setInfoOpen(true)} />
          </div>
          <div className="px-2 py-0.5 rounded-full border border-ink/20 text-[10px] font-semibold text-ink">
            update
          </div>
        </div>
      </aside>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} appSettings={appSettings} />

      {/* Info Modal */}
      <AboutModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />

      {/* New Workspace Modal */}
      <NewWorkspaceModal
        isOpen={newWorkspaceOpen}
        onClose={() => setNewWorkspaceOpen(false)}
        onCreate={async ({ name, path }) => {
          const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          window.location.reload();
        }}
      />

      {/* Scheduler Modal */}
      <SchedulerModal isOpen={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </>
  );
}

