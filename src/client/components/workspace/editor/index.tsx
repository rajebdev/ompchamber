import { useEffect, useState } from 'preact/hooks';
import { FileIcon } from '@/client/components/common/file-icon';
import { CodeSurface } from '@/client/components/common/code-surface';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { useScrollbarFade, scrollbarFadeClass } from '@/client/hooks/ui/scrollbar-fade';
import { EditorTabs } from '@/client/components/workspace/editor/Tabs';
import { EditorToolbar } from '@/client/components/workspace/editor/Toolbar';
import { ImageViewer } from '@/client/components/common/image-viewer';
import { getDefaultContent } from '@/shared/lib/code/editor-utils';
import { DiffPanel } from '@/client/components/workspace/diff-panel';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';
import { getSessionValue } from '@/shared/lib/workspace/session-state/store';
import { useFileEditor } from '@/client/hooks/editor/use-file-editor';

interface EditorProps {
  className?: string;
  openedFiles: any[];
  activeFileId: number | string | null;
  onSelectFile: (id: number | string) => void;
  onCloseFile: (id: number | string) => void;
  refreshKey?: number;
  onFileSaved?: () => void;
}

export function Editor({ 
  className = '', 
  openedFiles, 
  activeFileId, 
  onSelectFile, 
  onCloseFile, 
  refreshKey = 0,
  onFileSaved 
}: EditorProps) {
  const activeFile = openedFiles.find(f => f.id === activeFileId);
  
  const [previewMode, setPreviewMode, previewReady] = useSessionState<Record<string | number, boolean>>('editor.previewMode', {});
  const [zoomLevel, setZoomLevel] = useSessionState<number>('editor.zoomLevel', 12);
  const [isMaximized, setIsMaximized] = useState(false);
  const [wordWrap, setWordWrap] = useSessionState<boolean>('editor.wordWrap', true);
  const { sessionId } = useSessionStateContext();
  const { isScrolling, handleScroll } = useScrollbarFade();

  const editor = useFileEditor(activeFile ?? null, {
    fallback: getDefaultContent,
    onFileSaved,
  });

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
  const toolbarSaveStatus = editor.saveStatus === 'error' ? 'idle' : editor.saveStatus;

  const editorContainerClass = isMaximized 
    ? 'fixed inset-0 z-50 flex flex-col bg-canvas' 
    : `flex flex-col h-full bg-canvas ${className}`;

  return (
    <div className={editorContainerClass}>
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
            onOpenInEditor={() => {
              // Convert diff tab to regular editor tab
              activeFile.isDiff = false;
              onSelectFile(activeFile.id);
            }}
            onFileSaved={onFileSaved}
            className="flex-1"
          />
        ) : (
          <>
            <EditorToolbar
              path={activeFile.path}
              saveStatus={toolbarSaveStatus}
              wordWrap={wordWrap}
              isMd={isMd}
              isPreview={isPreview}
              isImage={editor.isImage}
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
            ) : (
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
                    value={currentContent}
                    onValueChange={editor.onChange}
                    language={editor.language}
                    wordWrap={wordWrap}
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
                    }}
                  />
                )}
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
