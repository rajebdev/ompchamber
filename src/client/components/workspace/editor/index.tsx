import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedKeyboardEvent } from 'preact';
import { AlertTriangle, Loader2 } from 'lucide-preact';
import { FileIcon } from '@/client/components/common/file-icon';
import { CodeSurface, type CodeSurfaceHandle } from '@/client/components/common/code-surface';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { useScrollbarFade, scrollbarFadeClass } from '@/client/hooks/ui/scrollbar-fade';
import { EditorTabs } from '@/client/components/workspace/editor/Tabs';
import { EditorToolbar } from '@/client/components/workspace/editor/Toolbar';
import { FindWidget } from '@/client/components/workspace/editor/FindWidget';
import { CommandPalette } from '@/client/components/workspace/editor/CommandPalette';
import { EDITOR_KEY_BINDINGS, isFindBarCommand, type EditorCommand } from '@/shared/lib/code/editor/keymap';
import type { TextRange } from '@/shared/lib/code/editor/commands';
import { resolveBinding } from '@/shared/lib/ui/key-binding';
import { ImageViewer } from '@/client/components/common/image-viewer';
import { DiffPanel } from '@/client/components/workspace/diff-panel';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';
import { getSessionValue } from '@/shared/lib/workspace/session-state/store';
import { useFileEditor } from '@/client/hooks/editor/use-file-editor';
import { useEditorFind } from '@/client/hooks/editor/use-editor-find';

interface EditorProps {
  className?: string;
  openedFiles: any[];
  activeFileId: number | string | null;
  onSelectFile: (id: number | string) => void;
  onCloseFile: (id: number | string) => void;
  /** Replace a diff tab with the plain editor tab for the same file. */
  onConvertDiffToEditor: (id: number | string) => void;
  refreshKey?: number;
  onFileSaved?: () => void;
}

export function Editor({ 
  className = '', 
  openedFiles, 
  activeFileId, 
  onSelectFile, 
  onCloseFile, 
  onConvertDiffToEditor,
  refreshKey = 0,
  onFileSaved 
}: EditorProps) {
  const activeFile = openedFiles.find(f => f.id === activeFileId);
  
  const [previewMode, setPreviewMode, previewReady] = useSessionState<Record<string | number, boolean>>('editor.previewMode', {});
  const [zoomLevel, setZoomLevel] = useSessionState<number>('editor.zoomLevel', 12);
  const [isMaximized, setIsMaximized] = useState(false);
  const [wordWrap, setWordWrap] = useSessionState<boolean>('editor.wordWrap', true);
  /** Extra ⌘D ranges; the surface paints them and the editor edits them by replication. */
  const [occurrences, setOccurrences] = useState<readonly TextRange[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { sessionId } = useSessionStateContext();
  const { isScrolling, handleScroll } = useScrollbarFade();
  const surfaceRef = useRef<CodeSurfaceHandle | null>(null);

  const editor = useFileEditor(activeFile ?? null, {
    // A file that could not be read must report the failure, not substitute
    // placeholder text — the mock sample used to be written straight over the
    // real file by the next save.
    reportSaveError: true,
    onFileSaved,
  });

  const find = useEditorFind({
    text: editor.content,
    documentKey: `${activeFile?.id ?? ''}\u0000${editor.language}`,
    readSelection: () => surfaceRef.current?.getSelection() ?? null,
    select: (start, end, focus = true) => surfaceRef.current?.select(start, end, focus),
    reveal: (offset) => surfaceRef.current?.revealOffset(offset),
    applyDocument: (value, caretStart, caretEnd) => surfaceRef.current?.applyDocument(value, caretStart, caretEnd),
    toggleWordWrap: () => setWordWrap((previous) => !previous),
  });
  // The capture handler below is rebuilt on every render anyway (it reads the
  // find state), so it is kept in a ref and the listener attached once.
  const findRef = useRef(find);
  findRef.current = find;

  useEffect(() => {
    if (refreshKey > 0) editor.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    editor.retain(openedFiles.map(f => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedFiles]);

  useEffect(() => {
    if (!previewReady) return;
    const id = activeFile?.id;
    if (id === undefined || id === null) return;
    if (!activeFile.name.endsWith('.md')) return;
    const stored = getSessionValue<Record<string | number, boolean>>(sessionId, 'editor.previewMode');
    if (stored && stored[id] !== undefined) return;
    setPreviewMode(prev => (prev[id] === undefined ? { ...prev, [id]: true } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewReady, activeFile]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        editor.saveNow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.saveNow]);

  const togglePreview = () => {
    if (!activeFile) return;
    setPreviewMode(prev => ({ ...prev, [activeFile.id]: !prev[activeFile.id] }));
  };

  /**
   * The one place a command runs, whatever asked for it — a chord, a toolbar
   * button or the palette. Splitting this by source is how a command ends up
   * working from the keyboard but not from the palette (or the reverse).
   */
  const runCommand = (command: EditorCommand) => {
    if (isFindBarCommand(command)) {
      findRef.current.runCommand(command);
      return;
    }
    if (command === 'toggleWordWrap') {
      setWordWrap((previous) => !previous);
      return;
    }
    // Everything else is the editor's, and it runs through the editor's own
    // dispatcher — the palette is a second way IN, never a second implementation.
    surfaceRef.current?.runCommand(command);
  };

  /**
   * Editor shortcuts, on the CAPTURE phase of the panel.
   *
   * Capture is what makes them work while focus is inside the document: the
   * `<textarea>` has its own handler (Tab, undo, Escape-to-blur) and would
   * otherwise see these first. Only the commands the PANEL owns are consumed
   * here — the editor's own keymap runs in the textarea, where it has the
   * buffer and the caret in hand.
   *
   * The panel is the scope, not the window: another panel's text field keeps
   * its own ⌘F, and the composer is untouched.
   */
  const handlePanelKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const current = findRef.current;
    if (event.key === 'Escape') {
      if (paletteOpen) {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(false);
        return;
      }
      if (!current.open) return;
      event.preventDefault();
      event.stopPropagation();
      current.close();
      return;
    }
    // ⌘⇧P opens the palette — the one chord that is not an editor command.
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyP') {
      event.preventDefault();
      event.stopPropagation();
      setPaletteOpen(true);
      return;
    }
    // While the bar is open, an unmodified key in one of ITS fields belongs to
    // the field — but F3 and the ⌘-chords below still dispatch, so stepping to
    // the next match from inside the find field works.
    const command = resolveBinding(EDITOR_KEY_BINDINGS, event);
    if (!command || !isFindBarCommand(command)) return;
    event.preventDefault();
    event.stopPropagation();
    runCommand(command);
  };

  if (openedFiles.length === 0) {
    return (
      <div className={`flex flex-col h-full bg-canvas items-center justify-center text-ink/40 ${className}`}>
        <FileIcon name="placeholder.txt" size={48} className="mb-4 opacity-20" />
        <p className="font-mono text-sm">Select a file to open</p>
      </div>
    );
  }

  const currentContent = editor.content;
  const isMd = activeFile?.name.endsWith('.md');
  const isPreview = activeFile ? previewMode[activeFile.id] : false;

  const editorContainerClass = isMaximized 
    ? 'fixed inset-0 z-50 flex flex-col bg-canvas' 
    : `flex flex-col h-full bg-canvas ${className}`;

  return (
    <div className={editorContainerClass} onKeyDownCapture={handlePanelKeyDown}>
      <EditorTabs
        openedFiles={openedFiles}
        activeFileId={activeFileId}
        onSelectFile={onSelectFile}
        onCloseFile={onCloseFile}
      />

      {activeFile ? (
        activeFile.isDiff ? (
          <DiffPanel
            filePath={activeFile.path}
            status={activeFile.diffStatus || 'M'}
            isStaged={Boolean(activeFile.diffStaged)}
            root={activeFile.root}
            repo={activeFile.repo || '.'}
            onOpenInEditor={() => onConvertDiffToEditor(activeFile.id)}
            onFileSaved={onFileSaved}
            className="flex-1"
          />
        ) : (
          <>
            <EditorToolbar
              path={activeFile.path}
              saveStatus={editor.saveStatus}
              wordWrap={wordWrap}
              isMd={isMd}
              isPreview={isPreview}
              copied={editor.copied}
              isImage={editor.isImage}
              saveDisabled={Boolean(editor.loadError)}
              isMaximized={isMaximized}
              findOpen={find.open}
              onToggleFind={() => (find.open ? find.close() : find.openFind())}
              onSave={editor.saveNow}
              onTogglePreview={togglePreview}
              onToggleWordWrap={() => setWordWrap(!wordWrap)}
              onZoomIn={() => setZoomLevel(z => Math.min(24, z + 1))}
              onZoomOut={() => setZoomLevel(z => Math.max(8, z - 1))}
              onCopy={editor.copy}
              onDownload={editor.download}
              onToggleMaximize={() => setIsMaximized(!isMaximized)}
            />

            {editor.isImage && editor.imageUrl ? (
              // The picture owns its own pan/zoom, so it must NOT sit inside
              // the scrolling text container — a wheel there would scroll the
              // pane instead of zooming the image.
              <ImageViewer src={editor.imageUrl} name={activeFile.name} className="flex-1 min-h-0" />
            ) : editor.isLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-ink/40 text-xs font-mono">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading file content…</span>
              </div>
            ) : editor.loadError ? (
              // A read that failed must say so. Without this the pane rendered
              // an empty (or substituted) buffer, and the next save wrote it
              // over the real file.
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <AlertTriangle size={20} className="text-error" />
                <span className="text-xs text-error font-sans">Could not read {activeFile.name}</span>
                <span className="text-[11px] text-ink/50 font-mono break-all">{editor.loadError}</span>
              </div>
            ) : (
              <div className="relative flex-1 min-h-0 flex flex-col">
                {find.open ? <FindWidget find={find} /> : null}
                {paletteOpen ? <CommandPalette onRun={runCommand} onClose={() => setPaletteOpen(false)} /> : null}
                <div onScroll={handleScroll} className={`flex-1 overflow-auto bg-paper flex ${scrollbarFadeClass(isScrolling)}`}>
                  {(isMd && isPreview) ? (
                    // No `prose` wrapper: markdown is styled by `.prose-content`
                    // alone (the same system the chat timeline uses). The
                    // typography plugin fought it — `.prose img` added 2em
                    // vertical margins that ballooned a badge row into its own
                    // line box, and `--tw-prose-*` colors ignored the theme.
                    <div className="p-6 max-w-4xl mx-auto font-sans flex-1" style={{ fontSize: `${zoomLevel}px` }}>
                      <MarkdownRenderer
                        content={currentContent}
                        document
                        scope={{ path: activeFile.path, root: activeFile.root, repo: activeFile.repo }}
                      />
                    </div>
                  ) : (
                    <CodeSurface
                      ref={surfaceRef}
                      value={currentContent}
                      onValueChange={editor.onChange}
                      language={editor.language}
                      wordWrap={wordWrap}
                      marks={find.open ? find.matches : undefined}
                      currentMark={find.currentIndex}
                      occurrences={occurrences}
                      onOccurrencesChange={setOccurrences}
                      onCommand={runCommand}
                      rootClassName="flex"
                      gutterClassName="flex flex-col text-right pl-4 pr-3 select-none text-ink/30 font-mono border-r border-ink/10 bg-canvas sticky left-0 z-10"
                      gutterStyle={{
                        fontSize: zoomLevel,
                        paddingTop: 16,
                        paddingBottom: 16,
                        lineHeight: 1.5,
                        fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", Consolas, monospace',
                      }}
                      gutterLineClassName="min-w-[1.5rem]"
                      // `min-w-max` keeps a long line intact and lets the panel
                      // scroll sideways; while wrapping it would instead widen the
                      // column past the panel, so the toggle had no effect at all.
                      editorWrapperClassName={`flex-1 code-surface ${wordWrap ? 'min-w-0' : 'min-w-max'}`}
                      editorPadding={16}
                      editorClassName="font-mono focus:outline-none"
                      editorStyle={{
                        fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", Consolas, monospace',
                        fontSize: zoomLevel,
                        lineHeight: 1.5,
                        minHeight: '100%',
                        // Breathing room under the last line. It has to live on the
                        // surface, not on the scroll container: a scroll container's
                        // own bottom padding is not part of its scrollable overflow,
                        // so `pb-*` on the scroller left the last line flush with the
                        // panel's edge (measured: padding-bottom 32px did not change
                        // scrollHeight by a single pixel).
                        paddingBottom: 16,
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink/40">
          <p className="font-mono text-sm">Select a tab to view content</p>
        </div>
      )}
    </div>
  );
}
