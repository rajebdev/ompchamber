import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { SessionSidebar } from '@/components/layout/session-sidebar/index';
import { type RightPanelType } from '@/components/layout/RightActivityBar';
import { SettingsModal } from '@/components/settings/Modal';
import {
  PanelLeft
} from 'lucide-react';
import type { WorkspaceFolderData, SettingsCategoryId } from '@/types';
import { activeProjectForSession } from '@/lib/workspace/active-project';
import { useSessionState } from '@/hooks/workspace/session-state';
import { useSessionStateContext } from '@/hooks/workspace/session-state/context';
import { TopNavbar } from '@/components/layout/desktop-layout/TopNavbar';
import { WorkspacePanels } from '@/components/layout/desktop-layout/WorkspacePanels';

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
  const [showRightPanel, setShowRightPanel] = useSessionState<boolean>('layout.showRightPanel', appSettings.showRightPanel ?? true);
  const [activeRightPanel, setActiveRightPanel] = useSessionState<RightPanelType>('layout.activeRightPanel', (appSettings.activeRightPanel as RightPanelType) ?? 'files');
  const [showLeftPanel, setShowLeftPanel] = useState(appSettings.showLeftPanel ?? true);
  const [layoutWeights, setLayoutWeights] = useState<Record<string, number>>(appSettings.desktopLayoutSizes || {});
  const weightsRef = useRef<Record<string, number>>(appSettings.desktopLayoutSizes || {});
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [openedFiles, setOpenedFiles] = useSessionState<any[]>('layout.openedFiles', []);
  const [activeFileId, setActiveFileId] = useSessionState<number | null>('layout.activeFileId', null);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const [userToggledEditor, setUserToggledEditor] = useState<boolean | null>(appSettings.userToggledEditor ?? null);
  // The editor only ever renders while files are open. A persisted manual
  // toggle is honored only then, so a reload with no open files never mounts
  // the editor just to unmount it a frame later (the "editor blip").
  const showEditor = openedFiles.length > 0 && (userToggledEditor ?? true);

  // The right-panel developer tools are scoped to the active workspace
  // context: the folder owning the selected session, or — when creating a
  // new session — the folder picked from the context dropdown / the "+" next
  // to a folder (mirrored into the `folderId` URL param).
  const [searchParams] = useSearchParams();
  const folderIdParam = searchParams.get('folderId');
  const activeProject = useMemo(() => {
    const sessionFolder = activeProjectForSession(folders, sessionId).folder;
    if (sessionFolder) return sessionFolder;
    if (folderIdParam) return folders.find(f => String(f.id) === String(folderIdParam)) ?? null;
    return null;
  }, [folders, sessionId, folderIdParam]);
  const activeProjectPath = activeProject?.project_path ?? null;
  const hasActiveContext = !!activeProject;
  const activeRootRef = useRef<string | null | undefined>(undefined);
  const { ready: layoutReady } = useSessionStateContext();
  const wipedRootRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (activeRootRef.current === activeProjectPath) return;
    activeRootRef.current = activeProjectPath;
    // Defer the wipe until the incoming session's blob has loaded: writing
    // `[]` pre-restore would be merged over the stored opened-files list by
    // loadSession and permanently drop it. Each root wipes at most once.
    if (!layoutReady || wipedRootRef.current === activeProjectPath) return;
    wipedRootRef.current = activeProjectPath;
    setOpenedFiles([]);
    setActiveFileId(null);
  }, [activeProjectPath, sessionId, layoutReady, setOpenedFiles, setActiveFileId]);

  const saveSetting = (key: string, value: any) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    }).catch(console.error);
  };

  // Single-owner layout persistence: merge the live weights of BOTH groups (the
  // outer left panel and the inner center/editor/right stack) into one complete
  // map before writing, so no group clobbers the other's widths.
  const persistLayout = useCallback(() => {
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    layoutSaveTimerRef.current = setTimeout(() => {
      saveSetting('desktopLayoutSizes', { ...weightsRef.current });
    }, 500);
  }, [saveSetting]);

  const handleWorkspaceLayout = useCallback(
    (inner: Record<string, number>) => {
      weightsRef.current = { ...weightsRef.current, ...inner };
      setLayoutWeights(weightsRef.current);
      persistLayout();
    },
    [persistLayout],
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('general');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);

  // Global keyboard shortcut for settings (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsCategory('general');
        setAutoOpenAddProvider(false);
        setSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global event listener for settings triggers
  useEffect(() => {
    const handleCustomOpenSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{ category?: SettingsCategoryId; autoOpenAdd?: boolean }>;
      if (customEvent.detail?.category) {
        setSettingsCategory(customEvent.detail.category);
      } else {
        setSettingsCategory('general');
      }
      setAutoOpenAddProvider(!!customEvent.detail?.autoOpenAdd);
      setSettingsOpen(true);
    };

    window.addEventListener('omp:open-settings', handleCustomOpenSettings);
    return () => window.removeEventListener('omp:open-settings', handleCustomOpenSettings);
  }, []);

  useEffect(() => {
    if (activeRightPanel === 'search' || activeRightPanel === 'git' || activeRightPanel === 'terminal' || activeRightPanel === 'context' || activeRightPanel === 'browser') {
      setUserToggledEditor(false);
    } else if (openedFiles.length > 0) {
      setUserToggledEditor(true);
    }
  }, [activeRightPanel, openedFiles.length]);

  const handleOpenFile = (file: any) => {
    const fileEntry = { ...file, root: file.root ?? activeProjectPath ?? undefined };
    setOpenedFiles(prev => {
      const existing = prev.find(f => f.id === fileEntry.id || (f.path && fileEntry.path && f.path === fileEntry.path));
      if (existing) {
        setActiveFileId(existing.id);
        return prev;
      }
      return [...prev, fileEntry];
    });
    setActiveFileId(fileEntry.id);
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

    // Adjust width dynamically (browser = 804px [3x268], terminal/context = 536px [2x268], others = 268px)
    if (nextShow && rightPanelRef.current) {
      setTimeout(() => {
        const targetPx = nextActive === 'browser' ? (268 * 3) : (nextActive === 'terminal' || nextActive === 'context') ? 536 : 268;
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

      {/* Main Workspace: full-height left sidebar (resizable) + right stack */}
      <div className="flex flex-1 overflow-hidden">
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
          id="ompchamber-main"
          onLayoutChanged={(_, meta) => {
            if (meta.isUserInteraction) {
              const left = leftPanelRef.current?.getSize()?.inPixels;
              if (left != null && left > 0) handleWorkspaceLayout({ left });
            }
          }}
        >
          {showLeftPanel && (
            <>
              <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={layoutWeights.left ?? 268} minSize={200} maxSize={600} collapsible>
                <SessionSidebar className="w-full h-full" folders={folders} onClose={() => handleToggleLeftPanel(false)} appSettings={appSettings} />
              </Panel>
              <CustomResizeHandle />
            </>
          )}

          {/* Right stack: top navbar + resizable workspace */}
          <Panel id="main-right-stack">
            <div className="flex flex-col h-full">
              <TopNavbar
                sessionTitle={sessionTitle}
                showLeftPanel={showLeftPanel}
                showEditor={showEditor}
                showRightPanel={showRightPanel}
                onSwitchToMobile={onSwitchToMobile}
                onToggleEditor={handleToggleEditor}
                onToggleRightPanel={handleToggleRightPanel}
              />

              <WorkspacePanels
                folders={folders}
                appSettings={appSettings}
                showEditor={showEditor}
                editorPanelRef={editorPanelRef}
                showRightPanel={showRightPanel}
                activeRightPanel={activeRightPanel}
                rightPanelRef={rightPanelRef}
                initialLayoutSizes={layoutWeights}
                hasActiveContext={hasActiveContext}
                activeProjectPath={activeProjectPath}
                openedFiles={openedFiles}
                activeFileId={activeFileId}
                refreshKey={refreshKey}
                onSetActiveFileId={setActiveFileId}
                onCloseFile={handleCloseFile}
                onOpenFile={handleOpenFile}
                onRefreshWorkspace={handleRefreshWorkspace}
                onChangeRightPanel={handleChangeRightPanel}
                onToggleRightPanel={handleToggleRightPanel}
                onSessionTitle={setSessionTitle}
                onWorkspaceLayout={handleWorkspaceLayout}
              />
            </div>
          </Panel>
        </Group>
      </div>

      {/* Global Desktop Settings Modal */}
      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => {
          setSettingsOpen(false);
          setAutoOpenAddProvider(false);
        }} 
        initialCategory={settingsCategory}
        autoOpenAddProvider={autoOpenAddProvider}
        appSettings={appSettings} 
      />
    </div>
  );
}
