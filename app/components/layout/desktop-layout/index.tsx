import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import { Group, Panel, type PanelImperativeHandle } from 'react-resizable-panels';
import { SessionSidebar } from '@/components/layout/session-sidebar/index';
import { type RightPanelType } from '@/lib/workspace/right-panels';
import { SettingsModal } from '@/components/settings/Modal';
import { PanelLeft } from 'lucide-react';
import type { WorkspaceFolderData, SettingsCategoryId } from '@/types';
import { activeProjectForSession } from '@/lib/workspace/active-project';
import { useFileTabs } from '@/hooks/workspace/file-tabs';
import { useSessionState } from '@/hooks/workspace/session-state';
import { TopNavbar } from '@/components/layout/desktop-layout/TopNavbar';
import { WorkspacePanels } from '@/components/layout/desktop-layout/WorkspacePanels';
import { useAgentStreamStatus } from '@/hooks/chat/omp/status';
import { usePanelWidths } from '@/hooks/workspace/panel-widths';
import { DEFAULT_PANEL_WIDTHS, type EditorWidthMode } from '@/lib/workspace/panel-widths';
import { ResizeHandle } from '@/components/layout/desktop-layout/ResizeHandle';

interface DesktopLayoutProps {
  folders: WorkspaceFolderData[];
  sessionId: string | null;
  onSwitchToMobile?: () => void;
  appSettings?: Record<string, any>;
}

/**
 * Push a remembered width onto a mounted panel. Panels report nothing while
 * unmounted, so a missing width (never resized) or a missing handle (panel
 * closed) simply leaves the panel at whatever its `defaultSize` derived.
 */
function applyWidth(
  ref: React.RefObject<PanelImperativeHandle | null>,
  px: number | undefined,
) {
  if (px != null) ref.current?.resize(px);
}

export function DesktopLayout({ folders, sessionId, onSwitchToMobile, appSettings = {} }: DesktopLayoutProps) {
  const [showRightPanel, setShowRightPanel] = useSessionState<boolean>('layout.showRightPanel', appSettings.showRightPanel ?? true);
  const [activeRightPanel, setActiveRightPanel] = useSessionState<RightPanelType>('layout.activeRightPanel', (appSettings.activeRightPanel as RightPanelType) ?? 'files');
  const [showLeftPanel, setShowLeftPanel] = useState(appSettings.showLeftPanel ?? true);
  const { widths: panelWidths, widthsRef, commitWidths } = usePanelWidths(appSettings, activeRightPanel);

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

  // A diff wants room a source file does not, so the editor panel keeps a
  // separate remembered width per tab kind.
  const editorWidthMode: EditorWidthMode = useMemo(
    () => (openedFiles.find(f => String(f.id) === String(activeFileId))?.isDiff ? 'diff' : 'editor'),
    [openedFiles, activeFileId],
  );

  const saveSetting = (key: string, value: any) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    }).catch(console.error);
  };

  // The sidebar shares a group with the workspace stack, so the stack absorbs
  // its width and only the toggle can lose it: reapplying it after the panel
  // remounts is what keeps the sidebar where the user left it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      applyWidth(leftPanelRef, widthsRef.current.left);
    });
    return () => cancelAnimationFrame(frame);
  }, [showLeftPanel, widthsRef]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('appearance');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const streamStatus = useAgentStreamStatus();

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

    // The width is not set here: the restore effect re-applies whichever width
    // this view remembers, and a view that opens for the first time derives it
    // from its own defaultSize. Reopening the same view keeps its width.
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
    // Reopening the editor re-applies the width its tab kind remembers (see the
    // restore effect), so a dragged width survives the toggle.
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
            if (!meta.isUserInteraction) return;
            const left = leftPanelRef.current?.getSize()?.inPixels;
            if (left != null && left > 0) commitWidths({ left: Math.round(left) });
          }}
        >
          {showLeftPanel && (
            <>
              <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={panelWidths.left ?? DEFAULT_PANEL_WIDTHS.left} minSize={200} maxSize={600} collapsible>
                <SessionSidebar className="w-full h-full" folders={folders} onClose={() => handleToggleLeftPanel(false)} appSettings={appSettings} />
              </Panel>
              <ResizeHandle />
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
                streamStatus={streamStatus}
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
                panelWidths={panelWidths}
                editorWidthMode={editorWidthMode}
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
                onPanelWidths={commitWidths}
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
