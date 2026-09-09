import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Search, 
  Plus, 
  FolderPlus, 
  Calendar, 
  Archive, 
  ArrowUpDown, 
  Settings, 
  Info, 
  Check
} from 'lucide-react';
import type { WorkspaceFolderData } from '@/types';
import { MobileSessionCategory } from '@/components/mobile/mobile-session-sidebar/MobileSessionItem';
import { 
  SettingsModal, 
  AboutModal, 
  NewWorkspaceModal, 
  SchedulerModal 
} from '@/components/layout/session-sidebar/SidebarModals';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useScrollbarFade } from '@/hooks/useScrollbarFade';
import packageJson from '@/../package.json';

interface MobileSessionSidebarProps {
  folders: WorkspaceFolderData[];
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSession: () => void;
  onCreateFolder: (input: { name: string; path?: string }) => Promise<void> | void;
  onClose: () => void;
  appSettings?: Record<string, any>;
}

export function MobileSessionSidebar({
  folders,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCreateFolder,
  onClose,
  appSettings = {}
}: MobileSessionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true
  });

  // Modals state (matching desktop)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Live session status: the chat timeline dispatches omp:session-processing
  // (processing true/false) through its single setGenerating throat, so the
  // sidebar can paint a spinner while a session runs and a check when done.
  const [sessionStatus, setSessionStatus] = useState<Record<string, 'processing' | 'done'>>({});
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  useEffect(() => {
    const onProcessing = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string; processing?: boolean } | undefined;
      const sid = detail?.sessionId;
      if (!sid) return;
      setSessionStatus(prev => {
        const next = { ...prev };
        if (detail.processing) {
          next[sid] = 'processing';
        } else if (String(sid) === String(activeSessionIdRef.current)) {
          // Completed while the user is already looking at it — no check.
          delete next[sid];
        } else {
          next[sid] = 'done';
        }
        return next;
      });
    };
    window.addEventListener('omp:session-processing', onProcessing);
    return () => window.removeEventListener('omp:session-processing', onProcessing);
  }, []);

  // The check is a "finished while you weren't looking" badge: opening a
  // session or navigating to another one clears it. Spinners survive.
  useEffect(() => {
    setSessionStatus(prev => {
      const next: Record<string, 'processing' | 'done'> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v === 'processing') next[k] = v;
      }
      return next;
    });
  }, [activeSessionId]);

  // Sorting state (matching desktop)
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortOption, setSortOption] = useState<'A-Z' | 'Z-A' | 'LATEST_SESSION' | 'LATEST_ADDED'>(() => {
    if (typeof window === 'undefined') return 'A-Z';
    const saved = localStorage.getItem('omp_sidebar_sort');
    return saved === 'A-Z' || saved === 'Z-A' || saved === 'LATEST_SESSION' || saved === 'LATEST_ADDED' ? saved : 'A-Z';
  });

  const handleSortChange = (opt: 'A-Z' | 'Z-A' | 'LATEST_SESSION' | 'LATEST_ADDED') => {
    setSortOption(opt);
    localStorage.setItem('omp_sidebar_sort', opt);
    setOptionsOpen(false);
  };

  const optionsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(optionsRef, () => setOptionsOpen(false));

  const { isScrolling, handleScroll } = useScrollbarFade();

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Filter and sort folders/sessions
  const processedFolders = useMemo(() => {
    let result = folders.map(folder => {
      if (!searchQuery.trim()) return folder;
      const query = searchQuery.toLowerCase();
      const matchesFolderName = folder.name.toLowerCase().includes(query);
      const filteredSessions = (folder.sessions || []).filter(s =>
        s.title.toLowerCase().includes(query)
      );
      if (matchesFolderName) return folder;
      return { ...folder, sessions: filteredSessions };
    }).filter(f => !searchQuery.trim() || f.sessions && f.sessions.length > 0);

    return [...result].sort((a, b) => {
      if (sortOption === 'A-Z') return a.name.localeCompare(b.name);
      if (sortOption === 'Z-A') return b.name.localeCompare(a.name);
      return 0;
    });
  }, [folders, searchQuery, sortOption]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-ink relative select-none">
      
      {/* Top Header Bar: Clean Title & Close Control */}
      <div className="h-14 border-b border-ink/10 flex items-center justify-between px-3.5 flex-shrink-0 bg-canvas">
        <div className="flex items-center space-x-2.5">
          <span className="font-bold text-sm tracking-tight flex items-center">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[16px] tracking-tighter">OMP</span>
            <span className="ml-[1px] text-ink font-bold text-sm">Chamber</span>
          </span>
          <span className="text-ink/25 text-xs select-none">/</span>
          <span className="text-[11px] font-semibold text-ink/60 uppercase tracking-wider font-mono">Sessions</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl hover:bg-ink/5 active:bg-ink/10 text-ink flex items-center justify-center transition-colors cursor-pointer"
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <X size={19} strokeWidth={2} />
        </button>
      </div>

      {/* Top Controls & Action Bar */}
      <div className="p-3 border-b border-ink/10 flex flex-col space-y-2.5 flex-shrink-0 bg-canvas">
        {/* Row 1: Primary + New Session Button & Quick Utility Buttons */}
        <div className="flex items-center space-x-2">
          {/* Large Ergonomic New Session Button */}
          <button
            type="button"
            onClick={() => { onNewSession(); onClose(); }}
            className="flex-1 h-9.5 flex items-center justify-center space-x-2 px-3.5 rounded-xl bg-ink text-canvas hover:bg-ink/90 active:scale-[0.98] text-xs font-semibold transition-all shadow-xs"
          >
            <Plus size={15} strokeWidth={2.4} />
            <span>New Session</span>
          </button>

          {/* New Workspace / Folder button */}
          <button
            type="button"
            onClick={() => setNewWorkspaceOpen(true)}
            className="w-9.5 h-9.5 rounded-xl border border-ink/15 bg-paper hover:bg-ink/5 active:scale-95 text-ink/80 hover:text-ink flex items-center justify-center transition-all flex-shrink-0 cursor-pointer shadow-xs"
            title="New Workspace"
            aria-label="New Workspace"
          >
            <FolderPlus size={16} strokeWidth={1.8} />
          </button>

          {/* Scheduler button */}
          <button
            type="button"
            onClick={() => setSchedulerOpen(true)}
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
              onClick={() => setOptionsOpen(!optionsOpen)}
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
                    onClick={() => handleSortChange(opt)}
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
                  onClick={() => { setShowArchived(!showArchived); setOptionsOpen(false); }}
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspaces & sessions..."
            className="w-full bg-paper border border-ink/15 rounded-xl pl-8 pr-8 py-2 text-xs text-ink placeholder-ink/40 focus:outline-none focus:border-ink/40 transition-colors font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
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
                  onClick={() => setSortOption('A-Z')} 
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
                  onClick={() => setShowArchived(false)} 
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

      {/* Scrollable Categories and Sessions */}
      <div 
        onScroll={handleScroll}
        className={`flex-1 scrollbar-overlay-container p-3 ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}
      >
        {processedFolders.length === 0 ? (
          <div className="text-center py-12 text-xs text-ink/50 italic">
            No matching sessions found
          </div>
        ) : (
          processedFolders.map(folder => (
            <MobileSessionCategory
              key={folder.id}
              folder={folder}
              activeSessionId={activeSessionId}
              onSelectSession={(id) => {
                onSelectSession(id);
                onClose();
              }}
              isExpanded={expandedFolders[folder.id] ?? true}
              onToggleExpand={() => toggleFolder(folder.id)}
              showArchived={showArchived}
              sessionStatus={sessionStatus}
            />
          ))
        )}
      </div>

      {/* Bottom Footer Bar: Settings & About (matching desktop) */}
      <div className="p-3 border-t border-ink/10 flex items-center justify-between flex-shrink-0 bg-canvas text-xs text-ink/60">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center space-x-1 hover:text-ink transition-colors"
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="flex items-center space-x-1 hover:text-ink transition-colors"
          >
            <Info size={14} />
            <span>About</span>
          </button>
        </div>
        <span className="font-mono text-[10px] text-ink/40">v{packageJson.version}</span>
      </div>

      {/* Reusable Modals */}
      <NewWorkspaceModal
        isOpen={newWorkspaceOpen}
        onClose={() => setNewWorkspaceOpen(false)}
        onCreate={onCreateFolder}
      />
      <SchedulerModal
        isOpen={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        appSettings={appSettings}
      />
      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />

    </div>
  );
}
