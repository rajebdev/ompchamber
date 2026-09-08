import React from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { ChatTimeline } from '@/components/workspace/ChatTimeline';
import { Editor } from '@/components/workspace/Editor';
import { FileExplorer } from '@/components/workspace/FileExplorer';
import { SearchPanel } from '@/components/workspace/SearchPanel';
import { GitPanel } from '@/components/workspace/GitPanel';
import { TerminalPanel } from '@/components/workspace/TerminalPanel';
import { ContextPanel } from '@/components/workspace/ContextPanel';
import { RightActivityBar, type RightPanelType } from '@/components/layout/RightActivityBar';
import type { WorkspaceFolderData } from '@/types';

interface WorkspacePanelsProps {
  folders: WorkspaceFolderData[];
  appSettings?: Record<string, any>;
  showEditor: boolean;
  editorPanelRef: React.RefObject<PanelImperativeHandle | null>;
  showRightPanel: boolean;
  activeRightPanel: RightPanelType;
  rightPanelRef: React.RefObject<PanelImperativeHandle | null>;
  initialLayoutSizes?: Record<string, number>;
  hasActiveContext: boolean;
  activeProjectPath?: string | null;
  openedFiles: any[];
  activeFileId: number | null;
  refreshKey: number;
  onSetActiveFileId: (id: number | null) => void;
  onCloseFile: (id: number) => void;
  onOpenFile: (file: any) => void;
  onRefreshWorkspace: () => void;
  onChangeRightPanel: (panel: RightPanelType) => void;
  onToggleRightPanel: () => void;
  onSessionTitle: (title: string | null) => void;
  onWorkspaceLayout: (sizes: Record<string, number>) => void;
}

function CustomResizeHandle() {
  return (
    <Separator className="relative w-1 outline-none group flex justify-center cursor-col-resize z-10">
      <div className="h-full w-[1px] bg-ink/10 group-hover:bg-ink/40 group-active:bg-ink/60 group-hover:w-0.5 transition-all" />
    </Separator>
  );
}

const pctOr = (saved: number | undefined, fallback?: number | string): number | string | undefined =>
  saved != null ? `${saved}%` : fallback;

export function WorkspacePanels(props: WorkspacePanelsProps) {
  const {
    folders,
    appSettings,
    showEditor,
    editorPanelRef,
    showRightPanel,
    activeRightPanel,
    rightPanelRef,
    initialLayoutSizes,
    hasActiveContext,
    activeProjectPath,
    openedFiles,
    activeFileId,
    refreshKey,
    onSetActiveFileId,
    onCloseFile,
    onOpenFile,
    onRefreshWorkspace,
    onChangeRightPanel,
    onToggleRightPanel,
    onSessionTitle,
    onWorkspaceLayout,
  } = props;

  return (
    <div className="flex flex-1 overflow-hidden">
      <Group
        orientation="horizontal"
        id="ompchamber-layout"
        onLayoutChanged={(sizes) => {
          const layoutMap: Record<string, number> = {};
          let i = 0;
          layoutMap.center = sizes[i++];
          if (showEditor) layoutMap.editor = sizes[i++];
          if (showRightPanel) layoutMap.right = sizes[i++];
          onWorkspaceLayout(layoutMap);
        }}
      >
        <Panel id="center-panel" defaultSize={pctOr(initialLayoutSizes?.center)} minSize={300}>
          <ChatTimeline className="w-full h-full" folders={folders} appSettings={appSettings} onSessionTitle={onSessionTitle} />
        </Panel>

        {showEditor && (
          <>
            <CustomResizeHandle />
            <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={pctOr(initialLayoutSizes?.editor, 536)} minSize={300}>
              <Editor
                className="w-full h-full"
                openedFiles={openedFiles}
                activeFileId={activeFileId}
                onSelectFile={onSetActiveFileId}
                onCloseFile={onCloseFile}
                refreshKey={refreshKey}
                onFileSaved={onRefreshWorkspace}
              />
            </Panel>
          </>
        )}

        {showRightPanel && (
          <>
            <CustomResizeHandle />
            <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={pctOr(initialLayoutSizes?.right, (activeRightPanel === 'terminal' || activeRightPanel === 'context') ? 536 : 268)} minSize={activeRightPanel === 'context' ? 420 : 200} maxSize={800} collapsible>
              {activeRightPanel === 'files' && <FileExplorer className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} onOpenFile={onOpenFile} refreshKey={refreshKey} onRefresh={onRefreshWorkspace} />}
              {activeRightPanel === 'search' && <SearchPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} />}
              {activeRightPanel === 'git' && <GitPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} refreshKey={refreshKey} />}
              {activeRightPanel === 'context' && <ContextPanel className="w-full h-full" enabled={hasActiveContext} refreshKey={refreshKey} onClose={onToggleRightPanel} />}
              <div className={`w-full h-full ${activeRightPanel === 'terminal' ? 'block' : 'hidden'}`}>
                <TerminalPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} onClose={onToggleRightPanel} />
              </div>
            </Panel>
          </>
        )}
      </Group>

      <RightActivityBar activePanel={activeRightPanel} onChangePanel={onChangeRightPanel} />
    </div>
  );
}
