import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { SessionSidebar } from '@/components/layout/session-sidebar/index';
import { type RightPanelType } from '@/components/layout/RightActivityBar';
import { SettingsModal } from '@/components/settings/Modal';
import { PanelLeft } from 'lucide-react';
import type { WorkspaceFolderData, SettingsCategoryId } from '@/types';
import { activeProjectForSession } from '@/lib/workspace/active-project';
import { useFileTabs } from '@/hooks/workspace/file-tabs';
import { useSessionState } from '@/hooks/workspace/session-state';
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

  const editorPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const [userToggledEditor, setUserToggledEditor] = useState<boolean | null>(appSettings.userToggledEditor ?? null);

  const [searchParams] = useSearchParams();
  const folderIdParam = searchParams.get('folderId');
  const activeProject = useMemo(() => {
    const sessionFolder = activeProjectForSession(folders, sessionId || '').folder;
    if (sessionFolder) return sessionFolder;
    if (folderIdParam) return folders.find(f => String(f.id) === String(folderIdParam)) ?? null;
    return null;
  }, [folders, sessionId, folderIdParam]);
  const activeProjectPath = activeProject?.project_path ?? null;
  const hasActiveContext = !!activeProject;

  const handleOpenTab = useCallback(() => {
    setUserToggledEditor(true);
    saveSetting('userToggledEditor', true);
  }, []);

  const {
    openedFiles,
    activeFileId,
    setActiveFileId,
    handleOpenFile,
    handleCloseFile,
  } = useFileTabs(activeProjectPath, sessionId || '', handleOpenTab);

  const showEditor = openedFiles.length > 0 && (userToggledEditor ?? true);

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
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('appearance');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);

  // Global keyboard shortcut for settings (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsCategory('appearance');
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
        setSettingsCategory('appearance');
      }
      setAutoOpenAddProvider(!!customEvent.detail?.autoOpenAdd);
      setSettingsOpen(true);
    };

    window.addEventListener('omp:open-settings', handleCustomOpenSettings);
    return () => window.removeEventListener('omp:open-settings', handleCustomOpenSettings);
  }, []);

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
        const targetPx = nextActive === 'browser' || nextActive === 'user-browser' ? (268 * 3) : (nextActive === 'terminal' || nextActive === 'context' || nextActive === 'usage') ? 536 : 268;
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
            className="w-12 h-full bg-paper border-r border-ink/10 flex flex-col items-center py-3 flex-shrink-0 cursor-pointer hover:bg-ink/5 transition-colors titlebar-no-drag" 
            style={{ paddingTop: 'max(0.75rem, env(titlebar-area-height, 0px))' }}
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
