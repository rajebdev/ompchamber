import React, { useRef } from 'react';
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

  // Live pixel sizes of the inner panels, kept in sync on every layout commit
  // (including imperative resizes) but only persisted to the server on real
  // user drags. Pixel sizes are stable across panel mount/unmount, so toggling
  // the editor or right panel never re-distributes the chat panel's width.
  const savedSizesRef = useRef<Record<string, number>>({ ...(initialLayoutSizes ?? {}) });

  const readPanelSizes = () => {
    const sizes: Record<string, number> = {};
    const editorSize = editorPanelRef.current?.getSize()?.inPixels;
    const rightSize = rightPanelRef.current?.getSize()?.inPixels;
    if (editorSize != null && editorSize > 0) sizes.editor = editorSize;
    if (rightSize != null && rightSize > 0) sizes.right = rightSize;
    return sizes;
  };

  const rightDefault = (activeRightPanel === 'terminal' || activeRightPanel === 'context') ? 536 : 268;

  return (
    <div className="flex flex-1 overflow-hidden">
      <Group
        orientation="horizontal"
        id="ompchamber-layout"
        onLayoutChanged={(_, meta) => {
          const sizes = readPanelSizes();
          savedSizesRef.current = { ...savedSizesRef.current, ...sizes };
          // Persist only real user drags; ignore mount/remount/constraint
          // recomputes so a reload never rewrites the saved layout.
          if (meta.isUserInteraction) onWorkspaceLayout(sizes);
        }}
      >
        <Panel id="center-panel" minSize="540px">
          <ChatTimeline className="w-full h-full" folders={folders} appSettings={appSettings} onSessionTitle={onSessionTitle} />
        </Panel>

        {showEditor && (
          <>
            <CustomResizeHandle />
            <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={savedSizesRef.current.editor ?? 536} minSize={300}>
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
            <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={savedSizesRef.current.right ?? rightDefault} minSize={activeRightPanel === 'context' ? 420 : activeRightPanel === 'git' ? 260 : 200} maxSize={800} collapsible>
              {activeRightPanel === 'files' && <FileExplorer className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} onOpenFile={onOpenFile} refreshKey={refreshKey} onRefresh={onRefreshWorkspace} />}
              {activeRightPanel === 'search' && <SearchPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} />}
              {activeRightPanel === 'git' && <GitPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} refreshKey={refreshKey} />}
              {activeRightPanel === 'context' && <ContextPanel className="w-full h-full" enabled={hasActiveContext} refreshKey={refreshKey} onClose={onToggleRightPanel} />}
              <div className={`w-full h-full ${activeRightPanel === 'terminal' ? 'block' : 'hidden'}`}>
                <TerminalPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} />
              </div>
            </Panel>
          </>
        )}
      </Group>

      <RightActivityBar activePanel={activeRightPanel} onChangePanel={onChangeRightPanel} isPanelOpen={showRightPanel} />
    </div>
  );
}
