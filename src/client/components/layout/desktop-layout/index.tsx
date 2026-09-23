import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import { Group, Panel, type PanelImperativeHandle } from '@/client/components/layout/desktop-layout/resizer';
import { SessionSidebar } from '@/client/components/layout/session-sidebar/index';
import type { RightPanelType } from '@/shared/lib/workspace/right-panels';
import { SettingsModal } from '@/client/components/settings/LazyModal';
import type { SettingsCategoryId } from '@/shared/types';
import { activeProjectForSession } from '@/shared/lib/workspace/active-project';
import { useFileTabs } from '@/client/hooks/workspace/file-tabs';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { TopNavbar } from '@/client/components/layout/desktop-layout/TopNavbar';
import { WorkspacePanels } from '@/client/components/layout/desktop-layout/WorkspacePanels';
import { useAgentStreamStatus } from '@/client/hooks/chat/omp/status';
import { usePanelWidths } from '@/client/hooks/workspace/panel-widths';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';
import { DEFAULT_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH, MIN_LEFT_PANEL_WIDTH, type EditorWidthMode } from '@/shared/lib/workspace/panel-widths';
import { ResizeHandle } from '@/client/components/layout/desktop-layout/ResizeHandle';
import { useChamberEvent, useWindowEvent } from '@/client/hooks/ui/window-event';

interface DesktopLayoutProps {
  sessionId: string | null;
  onSwitchToMobile?: () => void;
  appSettings?: Record<string, any>;
}

export function DesktopLayout({ sessionId, onSwitchToMobile, appSettings = {} }: DesktopLayoutProps) {
  const { folders } = useSidebarData();
  const [showRightPanel, setShowRightPanel] = useSessionState<boolean>('layout.showRightPanel', appSettings.showRightPanel ?? true);
  const [activeRightPanel, setActiveRightPanel] = useSessionState<RightPanelType>('layout.activeRightPanel', (appSettings.activeRightPanel as RightPanelType) ?? 'files');
  const [showLeftPanel, setShowLeftPanel] = useSessionState<boolean>('layout.showLeftPanel', appSettings.showLeftPanel ?? true);
  const { widths: panelWidths, commitWidths } = usePanelWidths(appSettings, activeRightPanel);

  const editorPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [userToggledEditor, setUserToggledEditor] = useSessionState<boolean | null>('layout.userToggledEditor', appSettings.userToggledEditor ?? null);

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
  }, [setUserToggledEditor]);

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

  // Width restoration is declarative: every panel's `defaultSize` is derived
  // from the remembered width for its current slot, and `Panel` adopts a
  // changed `defaultSize` itself. That covers the two cases that used to need
  // an imperative push — a right-panel view switch and an editor source↔diff
  // switch, both of which keep the panel mounted while only its width slot
  // changes — and it cannot go stale, because there is no cached layout to
  // disagree with the props.

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('appearance');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const streamStatus = useAgentStreamStatus();

  // Global keyboard shortcut for settings (Cmd/Ctrl + ,)
  useWindowEvent('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      setSettingsCategory('appearance');
      setAutoOpenAddProvider(false);
      setSettingsOpen(prev => !prev);
    }
  });

  // Global event listener for settings triggers
  useChamberEvent('omp:open-settings', (e) => {
    const customEvent = e as CustomEvent<{ category?: SettingsCategoryId; autoOpenAdd?: boolean }>;
    if (customEvent.detail?.category) {
      setSettingsCategory(customEvent.detail.category);
    } else {
      setSettingsCategory('appearance');
    }
    setAutoOpenAddProvider(!!customEvent.detail?.autoOpenAdd);
    setSettingsOpen(true);
  });

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
  };

  const handleToggleLeftPanel = (show: boolean) => {
    setShowLeftPanel(show);
  };

  const handleToggleRightPanel = () => {
    setShowRightPanel(!showRightPanel);
  };

  const handleToggleEditor = () => {
    setUserToggledEditor(!showEditor);
    // The editor panel keeps its own remembered width per tab kind, so a
    // dragged width survives the toggle without being re-applied here.
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-ink selection:text-canvas">

      {/* Main Workspace: full-height left sidebar (resizable) + right stack */}
      <div className="flex flex-1 overflow-hidden">
        <Group
          orientation="horizontal"
          id="ompchamber-main"
          onLayoutChanged={() => {
            const left = leftPanelRef.current?.getSize()?.inPixels;
            if (left != null && left > 0) commitWidths({ left: Math.round(left) });
          }}
        >
          <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={panelWidths.left ?? DEFAULT_LEFT_PANEL_WIDTH} minSize={MIN_LEFT_PANEL_WIDTH} maxSize={MAX_LEFT_PANEL_WIDTH} collapsed={!showLeftPanel}>
            <SessionSidebar className="w-full h-full" onClose={() => handleToggleLeftPanel(false)} appSettings={appSettings} />
          </Panel>
          {showLeftPanel && <ResizeHandle />}

          {/* Right stack: top navbar + resizable workspace (the group's filler) */}
          <Panel id="main-right-stack" filler minSize={0}>
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
                onToggleLeftPanel={() => handleToggleLeftPanel(!showLeftPanel)}
              />

              <WorkspacePanels
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
