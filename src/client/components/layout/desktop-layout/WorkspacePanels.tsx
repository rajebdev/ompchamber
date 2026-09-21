import { useMemo, useRef } from 'preact/hooks';
import { Suspense, lazy } from 'preact/compat';
import type { ReactNode, RefObject } from 'preact/compat';
import { Group, Panel, type PanelImperativeHandle } from '@/client/components/layout/desktop-layout/resizer';
import { ChatTimeline } from '@/client/components/workspace/chat-timeline/index';
import { getDesktopPanelView } from '@/client/components/common/lazy-panels';
import { RightActivityBar } from '@/client/components/layout/RightActivityBar';
import { ResizeHandle } from '@/client/components/layout/desktop-layout/ResizeHandle';
import { DEFAULT_RIGHT_PANEL_WIDTHS, MAX_RIGHT_PANEL_WIDTH, MIN_RIGHT_PANEL_WIDTHS, RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';
import { DEFAULT_PANEL_WIDTHS, MAX_EDITOR_PANEL_WIDTH, MIN_CHAT_PANEL_WIDTH, MIN_EDITOR_PANEL_WIDTH, type EditorWidthMode, type PanelWidths } from '@/shared/lib/workspace/panel-widths';

const Editor = lazy(() => import('@/client/components/workspace/editor/index').then((m) => ({ default: m.Editor })));

function PanelSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center text-ink/40 text-xs">Loading…</div>
    }>
      {children}
    </Suspense>
  );
}

interface WorkspacePanelsProps {
  appSettings?: Record<string, any>;
  showEditor: boolean;
  editorPanelRef: RefObject<PanelImperativeHandle | null>;
  showRightPanel: boolean;
  activeRightPanel: RightPanelType;
  rightPanelRef: RefObject<PanelImperativeHandle | null>;
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

  // Read inside effects without making a drag re-trigger them.
  const panelWidthsRef = useRef(panelWidths);
  panelWidthsRef.current = panelWidths;

  // One cached lazy per view, scoped to this layout instance: switching the
  // right panel toggles CSS visibility instead of unmounting, so a view's
  // state (tree expansion, search results, terminal buffer) survives switches
  // and no panel re-fetches its data just because the user looked away.
  const viewScope = useMemo(() => ({}), []);
  const rightViews = useMemo(
    () => RIGHT_PANEL_TYPES.map((view) => ({ view, Comp: getDesktopPanelView(viewScope, view) })),
    [viewScope],
  );

  /**
   * Widths of the fixed panels as they are right now, keyed by slot: the
   * editor (source or diff, whichever is showing) and the right panel under
   * the view it currently holds. The chat column is the group's filler, so it
   * has no width of its own to report.
   */
  const readPanelWidths = (): PanelWidths => {
    const patch: PanelWidths = {};
    const editor = editorPanelRef.current?.getSize()?.inPixels;
    const right = rightPanelRef.current?.getSize()?.inPixels;
    if (editor != null && editor > 0) patch[editorWidthMode] = Math.round(editor);
    if (right != null && right > 0) patch.right = { [activeRightPanel]: Math.round(right) };
    return patch;
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <Group
        orientation="horizontal"
        id="ompchamber-layout"
        onLayoutChanged={() => {
          // Persist only real drags: imperative restores and constraint
          // recomputes would otherwise rewrite the saved widths with the
          // clamped sizes they just derived from them.
          onPanelWidths(readPanelWidths());
        }}
      >
        <Panel id="center-panel" filler minSize={MIN_CHAT_PANEL_WIDTH}>
          <ChatTimeline className="w-full h-full" appSettings={appSettings} onSessionTitle={onSessionTitle} />
        </Panel>

        {showEditor && (
          <>
            <ResizeHandle />
            <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={panelWidths[editorWidthMode] ?? DEFAULT_PANEL_WIDTHS[editorWidthMode]} minSize={MIN_EDITOR_PANEL_WIDTH} maxSize={MAX_EDITOR_PANEL_WIDTH}>
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
                {rightViews.map(({ view, Comp }) => {
                  const isActiveView = activeRightPanel === view;
                  const base = {
                    className: 'w-full h-full',
                    // The terminal must stay enabled while hidden: swapping it
                    // to the placeholder mid-command would unmount the live
                    // stream. Everything else polls/re-reads only while shown.
                    enabled: view === 'terminal' ? hasActiveContext : hasActiveContext && isActiveView,
                    active: isActiveView,
                    refreshKey,
                    rootPath: activeProjectPath ?? undefined,
                    onRefresh: onRefreshWorkspace,
                    onOpenFile,
                    onClose: onToggleRightPanel,
                  };
                  return (
                    <div key={view} className={isActiveView ? 'w-full h-full' : 'hidden'}>
                      <Comp {...base} />
                    </div>
                  );
                })}
              </PanelSuspense>
            </Panel>
          </>
        )}
      </Group>

      <RightActivityBar activePanel={activeRightPanel} onChangePanel={onChangeRightPanel} isPanelOpen={showRightPanel} hasActiveContext={hasActiveContext} activeProjectPath={activeProjectPath} refreshKey={refreshKey} />
    </div>
  );
}
