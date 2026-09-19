import type { RefObject } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import { Group, Panel, type PanelImperativeHandle } from '@/client/components/layout/desktop-layout/resizer';
import { SessionSidebar } from '@/client/components/layout/session-sidebar/index';
import { type RightPanelType } from '@/shared/lib/workspace/right-panels';
import { SettingsModal } from '@/client/components/settings/Modal';
import { PanelLeft } from 'lucide-preact';
import type { SettingsCategoryId } from '@/shared/types';
import { activeProjectForSession } from '@/shared/lib/workspace/active-project';
import { useFileTabs } from '@/client/hooks/workspace/file-tabs';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { TopNavbar } from '@/client/components/layout/desktop-layout/TopNavbar';
import { WorkspacePanels } from '@/client/components/layout/desktop-layout/WorkspacePanels';
import { useAgentStreamStatus } from '@/client/hooks/chat/omp/status';
import { usePanelWidths } from '@/client/hooks/workspace/panel-widths';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';
import { DEFAULT_PANEL_WIDTHS, type EditorWidthMode } from '@/shared/lib/workspace/panel-widths';
import { ResizeHandle } from '@/client/components/layout/desktop-layout/ResizeHandle';

interface DesktopLayoutProps {
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
  ref: RefObject<PanelImperativeHandle | null>,
  px: number | undefined,
) {
  if (px != null) ref.current?.resize(px);
}

export function DesktopLayout({ sessionId, onSwitchToMobile, appSettings = {} }: DesktopLayoutProps) {
  const { folders } = useSidebarData();
  const [showRightPanel, setShowRightPanel] = useSessionState<boolean>('layout.showRightPanel', appSettings.showRightPanel ?? true);
  const [activeRightPanel, setActiveRightPanel] = useSessionState<RightPanelType>('layout.activeRightPanel', (appSettings.activeRightPanel as RightPanelType) ?? 'files');
  const [showLeftPanel, setShowLeftPanel] = useState(appSettings.showLeftPanel ?? true);
  const { widths: panelWidths, widthsRef, commitWidths } = usePanelWidths(appSettings, activeRightPanel);

  const editorPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
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
      const widths = widthsRef.current;
      if (widths) applyWidth(leftPanelRef, widths.left);
    });
    return () => cancelAnimationFrame(frame);
  }, [showLeftPanel, widthsRef]);

  // The right panel survives activity-bar view switches (only CSS hides the
  // outgoing view), so a mounted panel never re-reads its defaultSize. The
  // width the incoming view remembers must be pushed on imperatively; a
  // toggle-on remount already derives from defaultSize, making this a no-op.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      applyWidth(rightPanelRef, widthsRef.current?.right?.[activeRightPanel]);
    });
    return () => cancelAnimationFrame(frame);
  }, [showRightPanel, activeRightPanel, widthsRef]);

  // Same story for the editor across a source↔diff tab switch: the panel
  // stays mounted, so the width its tab kind remembers is re-applied here.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      applyWidth(editorPanelRef, widthsRef.current?.[editorWidthMode]);
    });
    return () => cancelAnimationFrame(frame);
  }, [showEditor, editorWidthMode, widthsRef]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('appearance');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefreshWorkspace = () => setRefreshKey(k => k + 1);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const streamStatus = useAgentStreamStatus();

  // Global keyboard shortcut for settings (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
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
          onLayoutChanged={() => {
            const left = leftPanelRef.current?.getSize()?.inPixels;
            if (left != null && left > 0) commitWidths({ left: Math.round(left) });
          }}
        >
          {showLeftPanel && (
            <>
              <Panel panelRef={leftPanelRef} id="left-panel" defaultSize={panelWidths.left ?? DEFAULT_PANEL_WIDTHS.left} minSize={200} maxSize={600} collapsible>
                <SessionSidebar className="w-full h-full" onClose={() => handleToggleLeftPanel(false)} appSettings={appSettings} />
              </Panel>
              <ResizeHandle />
            </>
          )}

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
