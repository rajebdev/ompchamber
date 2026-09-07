import React, { useState, useEffect, useRef } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { SessionSidebar } from '@/components/layout/SessionSidebar';
import { RightActivityBar, type RightPanelType } from '@/components/layout/RightActivityBar';
import { ChatTimeline } from '@/components/workspace/ChatTimeline';
import { Editor } from '@/components/workspace/Editor';
import { FileExplorer } from '@/components/workspace/FileExplorer';
import { SearchPanel } from '@/components/workspace/SearchPanel';
import { GitPanel } from '@/components/workspace/GitPanel';
import { TerminalPanel } from '@/components/workspace/TerminalPanel';
import { PWAInstallButton } from '@/components/common/PWAInstallButton';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { 
  PanelRightClose, 
  PanelRight, 
  PanelLeft, 
  LayoutTemplate, 
  Activity,
  Settings,
  Smartphone
} from 'lucide-react';
import type { WorkspaceFolderData } from '@/types';

interface DesktopLayoutProps {
  folders: WorkspaceFolderData[];
  sessionId: string | null;
  onSwitchToMobile?: () => void;
  appSettings?: Record<string, any>;
}

function CustomResizeHandle() {
  return (
    <Separator className="relative w-1 outline-none group flex justify-center cursor-col-resize z-10">
      <div className="h-full w-[1px] bg-ink/10 group-hover:bg-ink/40 group-active:bg-ink/60 group-hover:w-0.5 transition-all" />
    </Separator>
  );
}

export function DesktopLayout({ folders, sessionId, onSwitchToMobile, appSettings = {} }: DesktopLayoutProps) {
  const [showLeftPanel, setShowLeftPanel] = useState(appSettings.showLeftPanel ?? true);
  const [showRightPanel, setShowRightPanel] = useState(appSettings.showRightPanel ?? true);
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelType>(appSettings.activeRightPanel ?? 'files');
  const [leftPanelSize, setLeftPanelSize] = useState(appSettings.leftPanelSize ?? 15);
  const initialLayoutSizes = appSettings.desktopLayoutSizes || undefined;
  
  const [openedFiles, setOpenedFiles] = useState<any[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);

  const shouldShowEditor = openedFiles.length > 0 && activeRightPanel !== 'search' && activeRightPanel !== 'git' && activeRightPanel !== 'terminal';
  const [userToggledEditor, setUserToggledEditor] = useState<boolean | null>(appSettings.userToggledEditor ?? null);
  const showEditor = userToggledEditor !== null ? userToggledEditor : shouldShowEditor;

  const saveSetting = (key: string, value: any) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    }).catch(console.error);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);

  // Global keyboard shortcut for settings (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeRightPanel === 'search' || activeRightPanel === 'git' || activeRightPanel === 'terminal') {
      setUserToggledEditor(false);
    } else if (openedFiles.length > 0) {
      setUserToggledEditor(true);
    } else {
      setUserToggledEditor(false);
    }
  }, [activeRightPanel, openedFiles.length]);

  const handleOpenFile = (file: any) => {
    setOpenedFiles(prev => {
      const existing = prev.find(f => f.id === file.id || (f.path && file.path && f.path === file.path));
      if (existing) {
        setActiveFileId(existing.id);
        return prev;
      }
      return [...prev, file];
    });
    setActiveFileId(file.id);
    setUserToggledEditor(true);
  };

  // Listen to global open-file events from tool calling cards or buttons
  useEffect(() => {
    const handleCustomOpenFile = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name?: string; id?: number; content?: string }>;
      if (!customEvent.detail || !customEvent.detail.path) return;
      
      const rawPath = customEvent.detail.path.replace(/^\/+/, '');
      const name = customEvent.detail.name || rawPath.split('/').pop() || 'file';
      // Deterministic numeric ID based on path string
      let hash = 0;
      for (let i = 0; i < rawPath.length; i++) {
        hash = ((hash << 5) - hash) + rawPath.charCodeAt(i);
        hash |= 0;
      }
      const id = customEvent.detail.id || Math.abs(hash) || Date.now();

      handleOpenFile({
        id,
        name,
        path: rawPath,
        content: customEvent.detail.content
      });
    };

    window.addEventListener('omp:open-file', handleCustomOpenFile);
    return () => window.removeEventListener('omp:open-file', handleCustomOpenFile);
  }, []);

  const handleCloseFile = (id: number) => {
    setOpenedFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  const handleChangeRightPanel = (panel: RightPanelType) => {
    let nextShow = showRightPanel;
    let nextActive = activeRightPanel;
    
    if (activeRightPanel === panel && showRightPanel) {
      nextShow = false;
    } else {
      nextActive = panel;
      nextShow = true;
    }
    
    setShowRightPanel(nextShow);
    setActiveRightPanel(nextActive);

    // Adjust width dynamically (terminal = 536px, others = 268px)
    if (nextShow && rightPanelRef.current) {
      setTimeout(() => {
        const targetPx = nextActive === 'terminal' ? 536 : 268;
        rightPanelRef.current?.resize(targetPx);
      }, 50);
    }
    
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showRightPanel: nextShow, activeRightPanel: nextActive })
    }).catch(console.error);
  };

  const handleToggleLeftPanel = (show: boolean) => {
    setShowLeftPanel(show);
    saveSetting('showLeftPanel', show);
  };

  const handleToggleRightPanel = () => {
    const nextShow = !showRightPanel;
    setShowRightPanel(nextShow);
    saveSetting('showRightPanel', nextShow);
  };

  const handleToggleEditor = () => {
    const nextShow = !showEditor;
    setUserToggledEditor(nextShow);
    saveSetting('userToggledEditor', nextShow);

    if (nextShow && editorPanelRef.current) {
      setTimeout(() => {
        editorPanelRef.current?.resize(536);
      }, 50);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-ink selection:text-canvas">
      
      {/* Top Navbar */}
      <header className="h-12 flex-shrink-0 border-b border-ink/10 bg-paper flex items-center justify-between pr-4 z-20">
        <div className="flex items-center h-full w-full">
          <div className="flex items-center space-x-2 h-full px-4" style={{ width: showLeftPanel ? `${leftPanelSize}%` : 'auto' }}>
            <span className="font-bold text-sm tracking-tight hidden sm:flex items-center">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
              <span className="ml-[1px]">Chamber</span>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {sessionId && (
            <div className="hidden sm:flex items-center space-x-4 text-[10px] font-mono text-ink/60 pr-4 border-r border-ink/10">
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-ink"></span>
                <span>6.4%</span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity size={12} />
                <span>90%</span>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-1">
            {onSwitchToMobile && (
              <button 
                type="button"
                onClick={onSwitchToMobile}
                className="p-1.5 rounded hover:bg-ink/10 transition-colors text-ink/60 hover:text-ink"
                title="Switch to Mobile View"
              >
                <Smartphone size={16} />
              </button>
            )}
            <PWAInstallButton />
            <button 
              type="button"
              onClick={handleToggleEditor}
              className={`p-1.5 rounded hover:bg-ink/10 transition-colors ${showEditor ? 'text-ink' : 'text-ink/40'}`}
              title="Toggle Editor Layout"
            >
              <LayoutTemplate size={16} />
            </button>
            <button 
              type="button"
              onClick={handleToggleRightPanel}
              className={`p-1.5 rounded hover:bg-ink/10 transition-colors ${showRightPanel ? 'text-ink' : 'text-ink/40'}`}
              title="Toggle Right Panel"
            >
              {showRightPanel ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout with Resizable Panels */}
      <div className="flex-1 flex overflow-hidden">
        {!showLeftPanel && (
          <div 
            className="w-12 h-full bg-paper border-r border-ink/10 flex flex-col items-center py-3 flex-shrink-0 cursor-pointer hover:bg-ink/5 transition-colors" 
            onClick={() => handleToggleLeftPanel(true)} 
            title="Expand Sidebar"
          >
            <PanelLeft size={16} className="text-ink/60" />
            <div className="w-[1px] flex-1 bg-ink/10 my-4" />
          </div>
        )}

        <Group 
          orientation="horizontal" 
          id="ompchamber-layout"
          onLayoutChanged={(sizes) => {
            // Map sizes to panel identifiers based on visibility
            const layoutMap: Record<string, number> = {};
            let i = 0;
            if (showLeftPanel) layoutMap.left = sizes[i++];
            layoutMap.center = sizes[i++];
            if (showEditor) layoutMap.editor = sizes[i++];
            if (showRightPanel) layoutMap.right = sizes[i++];

            if (showLeftPanel && sizes.length > 0) {
              setLeftPanelSize(sizes[0]);
            }
            
            // Merge with existing so we don't lose hidden panel sizes
            const mergedLayoutMap = { ...initialLayoutSizes, ...layoutMap };
            
            // Debounce save layout sizes
            const timeoutId = (window as any)._layoutTimeout;
            if (timeoutId) clearTimeout(timeoutId);
            (window as any)._layoutTimeout = setTimeout(() => {
              saveSetting('desktopLayoutSizes', mergedLayoutMap);
            }, 500);
          }}
        >
          {showLeftPanel && (
            <>
              <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={initialLayoutSizes?.left ?? 268} minSize={200} maxSize={600} collapsible>
                <SessionSidebar className="w-full h-full" folders={folders} onClose={() => handleToggleLeftPanel(false)} appSettings={appSettings} />
              </Panel>
              <CustomResizeHandle />
            </>
          )}

          <Panel id="center-panel" defaultSize={initialLayoutSizes?.center ?? undefined} minSize={300}>
            <ChatTimeline className="w-full h-full" folders={folders} appSettings={appSettings} />
          </Panel>

          {showEditor && (
            <>
              <CustomResizeHandle />
              <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={initialLayoutSizes?.editor ?? 536} minSize={300}>
                <Editor 
                  className="w-full h-full" 
                  openedFiles={openedFiles}
                  activeFileId={activeFileId}
                  onSelectFile={setActiveFileId}
                  onCloseFile={handleCloseFile}
                  refreshKey={refreshKey}
                  onFileSaved={handleRefreshWorkspace}
                />
              </Panel>
            </>
          )}

          {showRightPanel && (
            <>
              <CustomResizeHandle />
              <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={initialLayoutSizes?.right ?? (activeRightPanel === 'terminal' ? 536 : 268)} minSize={200} maxSize={800} collapsible>
                {activeRightPanel === 'files' && <FileExplorer className="w-full h-full" onOpenFile={handleOpenFile} refreshKey={refreshKey} onRefresh={handleRefreshWorkspace} />}
                {activeRightPanel === 'search' && <SearchPanel className="w-full h-full" />}
                {activeRightPanel === 'git' && <GitPanel className="w-full h-full" refreshKey={refreshKey} />}
                {activeRightPanel === 'terminal' && <TerminalPanel className="w-full h-full" onClose={() => handleToggleRightPanel()} />}
              </Panel>
            </>
          )}
        </Group>

        <RightActivityBar activePanel={activeRightPanel} onChangePanel={handleChangeRightPanel} />
      </div>

      {/* Global Desktop Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} appSettings={appSettings} />
    </div>
  );
}
