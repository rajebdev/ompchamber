import React, { useState, useEffect } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
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
}

function CustomResizeHandle() {
  return (
    <Separator className="relative w-1 outline-none group flex justify-center cursor-col-resize z-10">
      <div className="h-full w-[1px] bg-[#141310]/10 group-hover:bg-[#141310]/40 group-active:bg-[#141310]/60 group-hover:w-0.5 transition-all" />
    </Separator>
  );
}

export function DesktopLayout({ folders, sessionId, onSwitchToMobile }: DesktopLayoutProps) {
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelType>('files');
  const [leftPanelSize, setLeftPanelSize] = useState(15);
  
  const [openedFiles, setOpenedFiles] = useState<any[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);

  const shouldShowEditor = openedFiles.length > 0 && activeRightPanel !== 'search' && activeRightPanel !== 'git' && activeRightPanel !== 'terminal';
  const [userToggledEditor, setUserToggledEditor] = useState<boolean | null>(null);
  const showEditor = userToggledEditor !== null ? userToggledEditor : shouldShowEditor;

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
    if (activeRightPanel === panel && showRightPanel) {
      setShowRightPanel(false);
    } else {
      setActiveRightPanel(panel);
      setShowRightPanel(true);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f4f1ea] text-[#141310] font-sans selection:bg-[#141310] selection:text-[#f4f1ea]">
      
      {/* Top Navbar */}
      <header className="h-12 flex-shrink-0 border-b border-[#141310]/10 bg-[#faf8f3] flex items-center justify-between pr-4 z-20">
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
            <div className="hidden sm:flex items-center space-x-4 text-[10px] font-mono text-[#141310]/60 pr-4 border-r border-[#141310]/10">
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#141310]"></span>
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
                className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors text-[#141310]/60 hover:text-[#141310]"
                title="Switch to Mobile View"
              >
                <Smartphone size={16} />
              </button>
            )}
            <PWAInstallButton />
            <button 
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors text-[#141310]/60 hover:text-[#141310]"
              title="Settings (Cmd+,)"
            >
              <Settings size={16} />
            </button>
            <button 
              type="button"
              onClick={() => setUserToggledEditor(!showEditor)}
              className={`p-1.5 rounded hover:bg-[#141310]/10 transition-colors ${showEditor ? 'text-[#141310]' : 'text-[#141310]/40'}`}
              title="Toggle Editor Layout"
            >
              <LayoutTemplate size={16} />
            </button>
            <button 
              type="button"
              onClick={() => setShowRightPanel(!showRightPanel)}
              className={`p-1.5 rounded hover:bg-[#141310]/10 transition-colors ${showRightPanel ? 'text-[#141310]' : 'text-[#141310]/40'}`}
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
            className="w-12 h-full bg-[#faf8f3] border-r border-[#141310]/10 flex flex-col items-center py-3 flex-shrink-0 cursor-pointer hover:bg-[#141310]/5 transition-colors" 
            onClick={() => setShowLeftPanel(true)} 
            title="Expand Sidebar"
          >
            <PanelLeft size={16} className="text-[#141310]/60" />
            <div className="w-[1px] flex-1 bg-[#141310]/10 my-4" />
          </div>
        )}

        <Group 
          orientation="horizontal" 
          id="ompchamber-layout"
          onLayoutChanged={(sizes) => {
            if (showLeftPanel && sizes.length > 0) {
              setLeftPanelSize(sizes[0]);
            }
          }}
        >
          {showLeftPanel && (
            <>
              <Panel id="left-panel" defaultSize={268} minSize={200} maxSize={500} collapsible>
                <SessionSidebar className="w-full h-full" folders={folders} onClose={() => setShowLeftPanel(false)} />
              </Panel>
              <CustomResizeHandle />
            </>
          )}

          <Panel id="center-panel" minSize={300}>
            <ChatTimeline className="w-full h-full" folders={folders} />
          </Panel>

          {showEditor && (
            <>
              <CustomResizeHandle />
              <Panel id="editor-panel" defaultSize={536} minSize={400}>
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
              <Panel id="right-panel" defaultSize={268} minSize={150} maxSize={500} collapsible>
                {activeRightPanel === 'files' && <FileExplorer className="w-full h-full" onOpenFile={handleOpenFile} refreshKey={refreshKey} onRefresh={handleRefreshWorkspace} />}
                {activeRightPanel === 'search' && <SearchPanel className="w-full h-full" />}
                {activeRightPanel === 'git' && <GitPanel className="w-full h-full" refreshKey={refreshKey} />}
                {activeRightPanel === 'terminal' && <TerminalPanel className="w-full h-full" onClose={() => setShowRightPanel(false)} />}
              </Panel>
            </>
          )}
        </Group>

        <RightActivityBar activePanel={activeRightPanel} onChangePanel={handleChangeRightPanel} />
      </div>

      {/* Global Desktop Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
