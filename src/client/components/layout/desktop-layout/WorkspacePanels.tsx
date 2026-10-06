import { useRef } from 'preact/hooks';
import { Suspense, lazy } from 'preact/compat';
import type { ReactNode, RefObject } from 'preact/compat';
import { Group, Panel, type PanelImperativeHandle } from '@/client/components/layout/desktop-layout/resizer';
import { ChatTimeline } from '@/client/components/workspace/chat-timeline/index';
import { usePanelCatalog, PluginPanelBody, type PanelBodyProps } from '@/client/components/workspace/plugin-panel/resolve';
import { PanelHostProvider } from '@ompchamber/ui';
import { RightActivityBar } from '@/client/components/layout/RightActivityBar';
import { ResizeHandle } from '@/client/components/layout/desktop-layout/ResizeHandle';
import { useAvailableWidth } from '@/client/hooks/workspace/available-width';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';
import {
  DEFAULT_EDITOR_FRACTIONS,
  DEFAULT_EDITOR_WIDTHS,
  MIN_CHAT_PANEL_WIDTH,
  MIN_EDITOR_PANEL_WIDTH,
  resolvePanelWidth,
  type EditorWidthMode,
  type PanelWidths,
} from '@/shared/lib/workspace/panel-widths';

const Editor = lazy(() => import('@/client/components/workspace/editor/index').then((m) => ({ default: m.Editor })));

function PanelSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center text-ink/40">
        <span className="text-xs font-mono">Loading…</span>
      </div>
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
  /** A built-in view id or a plugin panel key (`plugin:<id>/<panel>`). */
  activeRightPanel: string;
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
  /** Replace a diff tab with the plain editor tab for the same file. */
  onConvertDiffToEditor: (id: number | string) => void;
  onOpenFile: (file: any) => void;
  onRefreshWorkspace: () => void;
  onChangeRightPanel: (panel: string) => void;
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
    onConvertDiffToEditor,
    onOpenFile,
    onRefreshWorkspace,
    onChangeRightPanel,
    onToggleRightPanel,
    onSessionTitle,
    onPanelWidths,
  } = props;

  // The group's own area: the base every stored fraction is a share of, and the
  // budget the chat floor is subtracted from. Measured through the group's
  // element, not a wrapper — the wrapper also spans the activity bar, which is
  // not area any panel may take.
  const groupRef = useRef<HTMLDivElement>(null);
  const available = useAvailableWidth(groupRef);

  // ONE catalog for both kinds of panel. The list is memoised per render pass
  // and the components inside it are `lazy()` at module scope, so switching the
  // right panel toggles CSS visibility instead of unmounting: a view's state
  // (tree expansion, search results, terminal buffer) survives switches and no
  // panel re-fetches its data just because the user looked away.
  const catalog = usePanelCatalog();
  const { sessionId } = useSessionStateContext();
  const activePanel = catalog.find((panel) => panel.id === activeRightPanel);

  // Separators present in this group, which also consume width.
  const handleCount = (showEditor ? 1 : 0) + (showRightPanel ? 1 : 0);

  // The active view's own floor and open size, resolved once here rather than
  // at each use, so the editor's sibling reservation and the right panel's own
  // floor can never be computed from different values. A view that is switched
  // off (or a plugin that has not loaded) has no entry, and the right panel
  // falls back to the editor's own floor — it renders the notice, not a view.
  const rightPanelMin = activePanel?.minWidth ?? MIN_EDITOR_PANEL_WIDTH;

  const editorWidth = resolvePanelWidth({
    stored: panelWidths[editorWidthMode],
    defaultFraction: DEFAULT_EDITOR_FRACTIONS[editorWidthMode],
    defaultPx: DEFAULT_EDITOR_WIDTHS[editorWidthMode],
    available,
    min: MIN_EDITOR_PANEL_WIDTH,
    // The right panel renders after the editor, so it absorbs the remainder.
    // Reserving this view's own floor is enough: the editor's share is what
    // the ceiling subtracts.
    siblingMin: showRightPanel ? rightPanelMin : 0,
    handleCount,
  });

  const rightWidth = resolvePanelWidth({
    stored: panelWidths.right?.[activeRightPanel],
    defaultFraction: activePanel?.defaultFraction ?? DEFAULT_EDITOR_FRACTIONS[editorWidthMode],
    defaultPx: activePanel?.defaultWidth ?? MIN_EDITOR_PANEL_WIDTH,
    available,
    min: rightPanelMin,
    // The editor took its share first; only its floor is reserved here.
    siblingMin: showEditor ? MIN_EDITOR_PANEL_WIDTH : 0,
    handleCount,
  });

  /**
   * Widths of the fixed panels as they are right now, keyed by slot: the
   * editor (source or diff, whichever is showing) and the right panel under
   * the view it currently holds. The chat column is the group's filler, so it
   * has no width of its own to report.
   *
   * Each is stored as a share of the area it was measured in, so the layout
   * follows a window resize instead of holding a pixel value that was only
   * right on the display it was dragged on.
   */
  const readPanelWidths = (): PanelWidths => {
    const patch: PanelWidths = {};
    const editor = editorPanelRef.current?.getSize()?.inPixels;
    const right = rightPanelRef.current?.getSize()?.inPixels;
    if (editor != null && editor > 0) {
      patch[editorWidthMode] = { px: Math.round(editor), ...(available ? { fraction: editor / available } : {}) };
    }
    if (right != null && right > 0) {
      patch.right = {
        [activeRightPanel]: { px: Math.round(right), ...(available ? { fraction: right / available } : {}) },
      };
    }
    return patch;
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <Group
        orientation="horizontal"
        id="ompchamber-layout"
        className="flex-1 min-w-0"
        groupRef={groupRef}
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

        {showEditor && <ResizeHandle />}
        <Panel panelRef={editorPanelRef} id="editor-panel" defaultSize={editorWidth} minSize={MIN_EDITOR_PANEL_WIDTH} collapsed={!showEditor}>
          <PanelSuspense>
            <Editor
              className="w-full h-full"
              activeEditorPanelKey={null}
              openedFiles={openedFiles}
              activeFileId={activeFileId}
              onSelectFile={onSetActiveFileId}
              onCloseFile={onCloseFile}
              onConvertDiffToEditor={onConvertDiffToEditor}
              refreshKey={refreshKey}
              onFileSaved={onRefreshWorkspace}
            />
          </PanelSuspense>
        </Panel>

        {showRightPanel && <ResizeHandle />}
        <Panel panelRef={rightPanelRef} id="right-panel" defaultSize={rightWidth} minSize={rightPanelMin} collapsed={!showRightPanel}>
          <PanelSuspense>
            {/* ONE renderer for both kinds of panel. Each view stays MOUNTED
                while another is on screen (hidden with CSS), so a tree's
                expansion, a search's results and a terminal's buffer survive a
                switch. A plugin panel is mounted only while it is the active
                one: a hidden plugin is a component nobody is looking at, and
                the host owns no state of its own to preserve. */}
            {catalog.map((panel) => {
              const isActiveView = activeRightPanel === panel.id;
              if (!panel.builtin && !isActiveView) return null;
              const body: PanelBodyProps = {
                className: 'w-full h-full',
                sessionId,
                // A view that stays live while hidden keeps reading even when
                // another view is on screen — the terminal owns a live PTY and
                // swapping it to the placeholder mid-command would drop the
                // stream. Everything else polls only while shown.
                enabled: panel.liveWhileHidden
                  ? hasActiveContext
                  : hasActiveContext && isActiveView,
                active: isActiveView,
                refreshKey,
                ...(activeProjectPath ? { rootPath: activeProjectPath } : {}),
                onRefresh: onRefreshWorkspace,
                onOpenFile,
                onClose: onToggleRightPanel,
              };
              return (
                <div key={panel.id} className={isActiveView ? 'w-full h-full' : 'hidden'}>
                  <PanelHostProvider value={body}>{panel.render(body)}</PanelHostProvider>
                </div>
              );
            })}
            {/* The selection names a panel that is switched off, uninstalled, or
                whose bundle has not loaded — a notice, never a blank column. */}
            {!activePanel ? (
              <div className="w-full h-full">
                <PluginPanelBody panelKey={activeRightPanel} />
              </div>
            ) : null}
          </PanelSuspense>
        </Panel>
      </Group>

      <RightActivityBar activePanel={activeRightPanel} onChangePanel={onChangeRightPanel} isPanelOpen={showRightPanel} hasActiveContext={hasActiveContext} activeProjectPath={activeProjectPath} refreshKey={refreshKey} />
    </div>
  );
}
