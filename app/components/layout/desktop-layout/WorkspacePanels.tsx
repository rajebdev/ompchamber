import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { Group, Panel, type GroupImperativeHandle, type Layout, type PanelImperativeHandle } from 'react-resizable-panels';
import { ChatTimeline } from '@/components/workspace/chat-timeline/index';
import { LazyFileExplorer, LazySearchPanel, LazyGitPanel, LazyTerminalPanel, LazyContextPanel, LazyBrowserPanel, LazyUserBrowserPanel, LazyUsagePanel } from '@/components/common/lazy-panels';
import { RightActivityBar } from '@/components/layout/RightActivityBar';
import { ResizeHandle } from '@/components/layout/desktop-layout/ResizeHandle';
import {
  DEFAULT_RIGHT_PANEL_WIDTHS,
  MAX_RIGHT_PANEL_WIDTH,
  MIN_RIGHT_PANEL_WIDTHS,
  type RightPanelType,
} from '@/lib/workspace/right-panels';
import { DEFAULT_PANEL_WIDTHS, type EditorWidthMode, type PanelWidths } from '@/lib/workspace/panel-widths';
import type { WorkspaceFolderData } from '@/types';

const Editor = lazy(() => import('@/components/workspace/editor/index').then((m) => ({ default: m.Editor })));

function PanelSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center text-ink/40 text-xs">Loading…</div>
    }>
      {children}
    </Suspense>
  );
}

interface WorkspacePanelsProps {
  folders: WorkspaceFolderData[];
  appSettings?: Record<string, any>;
  showEditor: boolean;
  editorPanelRef: React.RefObject<PanelImperativeHandle | null>;
  showRightPanel: boolean;
  activeRightPanel: RightPanelType;
  rightPanelRef: React.RefObject<PanelImperativeHandle | null>;
  /** Remembered width per panel, keyed the same way the layout reports them. */
  panelWidths: PanelWidths;
  /** Whether the editor panel currently shows a source file or a diff. */
  editorWidthMode: EditorWidthMode;
  hasActiveContext: boolean;
  activeProjectPath?: string | null;
  openedFiles: any[];
  activeFileId: number | string | null;
  refreshKey: number;
  onSetActiveFileId: (id: number | string | null) => void;
  onCloseFile: (id: number | string) => void;
  onOpenFile: (file: any) => void;
  onRefreshWorkspace: () => void;
  onChangeRightPanel: (panel: RightPanelType) => void;
  onToggleRightPanel: () => void;
  onSessionTitle: (title: string | null) => void;
  onPanelWidths: (patch: PanelWidths) => void;
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
    panelWidths,
    editorWidthMode,
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
    onPanelWidths,
  } = props;

  const chatPanelRef = useRef<PanelImperativeHandle>(null);
  const layoutGroupRef = useRef<GroupImperativeHandle>(null);
  // Read inside the restore effect without making a drag re-trigger it.
  const panelWidthsRef = useRef(panelWidths);
  panelWidthsRef.current = panelWidths;

  /**
   * Widths of the panels in this group as they are right now, keyed by slot:
   * the chat column, the editor (source or diff, whichever is showing) and the
   * right panel under the view it currently holds. A drag on one separator
   * commits every panel it moved, so the group's sizes never drift apart.
   */
  const readPanelWidths = (): PanelWidths => {
    const patch: PanelWidths = {};
    const chat = chatPanelRef.current?.getSize()?.inPixels;
    const editor = editorPanelRef.current?.getSize()?.inPixels;
    const right = rightPanelRef.current?.getSize()?.inPixels;
    if (chat != null && chat > 0) patch.chat = Math.round(chat);
    if (editor != null && editor > 0) patch[editorWidthMode] = Math.round(editor);
    if (right != null && right > 0) patch.right = { [activeRightPanel]: Math.round(right) };
    return patch;
  };

  /**
   * The panels library caches one layout per panel composition, so a panel that
   * comes back — editor reopened, a different right view, a source tab swapped
   * for a diff — would otherwise replay the sizes that composition held the
   * last time it was on screen. Rebuild the whole layout from the remembered
   * pixel widths instead: the fixed panels take their own width back and the
   * chat column absorbs the remainder, so the map always sums to 100% and no
   * panel is scaled behind the user's back.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const group = layoutGroupRef.current;
      const current = group?.getLayout();
      const chat = chatPanelRef.current?.getSize();
      if (!group || !current || !chat || chat.asPercentage <= 0) return;

      const saved = panelWidthsRef.current;
      const editorPx = showEditor
        ? saved[editorWidthMode] ?? DEFAULT_PANEL_WIDTHS[editorWidthMode]
        : 0;
      const rightPx = showRightPanel
        ? saved.right?.[activeRightPanel] ?? DEFAULT_RIGHT_PANEL_WIDTHS[activeRightPanel]
        : 0;
      // A panel's size over its own percentage recovers the group's content
      // width, the same basis the library normalizes layouts against.
      const basisPx = chat.inPixels / (chat.asPercentage / 100);
      const toPercent = (px: number) => (px / basisPx) * 100;

      const next: Layout = { ...current, 'center-panel': toPercent(basisPx - editorPx - rightPx) };
      if (showEditor) next['editor-panel'] = toPercent(editorPx);
      if (showRightPanel) next['right-panel'] = toPercent(rightPx);
      group.setLayout(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [showEditor, showRightPanel, activeRightPanel, editorWidthMode]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <Group
        orientation="horizontal"
        id="ompchamber-layout"
        groupRef={layoutGroupRef}
        onLayoutChanged={(_, meta) => {
          // Persist only real drags: mount, imperative restores and constraint
          // recomputes would otherwise rewrite the saved widths with the
          // clamped sizes they just derived from them.
          if (meta.isUserInteraction) onPanelWidths(readPanelWidths());
        }}
      >
        <Panel panelRef={chatPanelRef} id="center-panel" defaultSize={panelWidths.chat ?? DEFAULT_PANEL_WIDTHS.chat} minSize="540px">
          <ChatTimeline className="w-full h-full" folders={folders} appSettings={appSettings} onSessionTitle={onSessionTitle} />
        </Panel>

        {showEditor && (
          <>
            <ResizeHandle />
            <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={panelWidths[editorWidthMode] ?? DEFAULT_PANEL_WIDTHS[editorWidthMode]} minSize={300}>
              <PanelSuspense>
                <Editor
                  className="w-full h-full"
                  openedFiles={openedFiles}
                  activeFileId={activeFileId}
                  onSelectFile={onSetActiveFileId}
                  onCloseFile={onCloseFile}
                  refreshKey={refreshKey}
                  onFileSaved={onRefreshWorkspace}
                />
              </PanelSuspense>
            </Panel>
          </>
        )}

        {showRightPanel && (
          <>
            <ResizeHandle />
            <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={panelWidths.right?.[activeRightPanel] ?? DEFAULT_RIGHT_PANEL_WIDTHS[activeRightPanel]} minSize={MIN_RIGHT_PANEL_WIDTHS[activeRightPanel]} maxSize={MAX_RIGHT_PANEL_WIDTH} collapsible>
              <PanelSuspense>
                {activeRightPanel === 'files' && <LazyFileExplorer className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} onOpenFile={onOpenFile} refreshKey={refreshKey} onRefresh={onRefreshWorkspace} />}
                {activeRightPanel === 'search' && <LazySearchPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} />}
                {activeRightPanel === 'git' && <LazyGitPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} refreshKey={refreshKey} />}
                {activeRightPanel === 'context' && <LazyContextPanel className="w-full h-full" enabled={hasActiveContext} refreshKey={refreshKey} onClose={onToggleRightPanel} />}
                <div className={`w-full h-full ${activeRightPanel === 'terminal' ? 'block' : 'hidden'}`}>
                  <LazyTerminalPanel className="w-full h-full" enabled={hasActiveContext} rootPath={activeProjectPath ?? undefined} />
                </div>
                <div className={`w-full h-full ${activeRightPanel === 'user-browser' ? 'block' : 'hidden'}`}>
                  <LazyUserBrowserPanel className="w-full h-full" />
                </div>
                <div className={`w-full h-full ${activeRightPanel === 'browser' ? 'block' : 'hidden'}`}>
                  <LazyBrowserPanel className="w-full h-full" active={activeRightPanel === 'browser'} />
                </div>
                {activeRightPanel === 'usage' && <LazyUsagePanel className="w-full h-full" />}
              </PanelSuspense>
            </Panel>
          </>
        )}
      </Group>

      <RightActivityBar activePanel={activeRightPanel} onChangePanel={onChangeRightPanel} isPanelOpen={showRightPanel} hasActiveContext={hasActiveContext} activeProjectPath={activeProjectPath} refreshKey={refreshKey} />
    </div>
  );
}
