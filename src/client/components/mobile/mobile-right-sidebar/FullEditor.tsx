import { useState } from 'preact/hooks';
import { AlertTriangle, Loader2 } from 'lucide-preact';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { CodeSurface } from '@/client/components/common/code-surface';
import { EditorHeader } from '@/client/components/mobile/mobile-right-sidebar/Header';
import { useScrollbarFade, scrollbarFadeClass } from '@/client/hooks/ui/scrollbar-fade';
import { useFileEditor } from '@/client/hooks/editor/use-file-editor';

interface MobileFullEditorProps {
  file: {
    name: string;
    path?: string;
    content?: string;
    root?: string;
    repo?: string;
  };
  onClose: () => void;
  /** Fired after a debounced write lands, so the workspace panels can refresh. */
  onFileSaved?: () => void;
}

export function MobileFullEditor({ file, onClose, onFileSaved }: MobileFullEditorProps) {
  const [isPreview, setIsPreview] = useState(file.name.endsWith('.md'));
  const [fontSize, setFontSize] = useState(12);
  const [wordWrap, setWordWrap] = useState(true);
  const { isScrolling, handleScroll } = useScrollbarFade();

  const isMd = file.name.endsWith('.md');

  const editor = useFileEditor(file, {
    reportLoadError: true,
    flushOnUnmount: true,
    reportSaveError: true,
    downloadMimeType: 'text/plain;charset=utf-8',
    onFileSaved,
  });

  const content = editor.content;
  const lang = editor.language;
  const linesCount = content.split('\n').length;

  return (
    <div className="fixed inset-x-0 top-0 h-dvh z-[60] bg-paper flex flex-col font-mono text-xs select-none">
      
      <EditorHeader
        fileName={file.name}
        isMarkdown={isMd}
        isPreview={isPreview}
        wordWrap={wordWrap}
        copied={editor.copied}
        onClose={onClose}
        onTogglePreview={() => setIsPreview(!isPreview)}
        onToggleWrap={() => setWordWrap(!wordWrap)}
        onZoomOut={() => setFontSize(prev => Math.max(10, prev - 1))}
        onZoomIn={() => setFontSize(prev => Math.min(18, prev + 1))}
        onCopy={editor.copy}
        onDownload={editor.download}
      />

      {/* Editor Content Area - Desktop styled: bg-paper text-ink */}
      <div onScroll={handleScroll} className={`flex-1 min-h-0 overflow-auto relative bg-paper text-ink select-text ${scrollbarFadeClass(isScrolling)}`}>
        {editor.isLoading ? (
          <div className="flex items-center justify-center h-full text-ink/40 text-xs gap-2">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading file content...</span>
          </div>
        ) : editor.loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <AlertTriangle size={20} className="text-error" />
            <span className="text-xs text-error font-sans">Could not read {file.name}</span>
            <span className="text-[11px] text-ink/50 font-mono break-all">{editor.loadError}</span>
          </div>
        ) : isMd && isPreview ? (
          /* Markdown Preview Mode */
          <div className="p-4 bg-paper text-ink min-h-full font-sans prose prose-sm max-w-none">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          /* Code Editor with Line Numbers - Desktop styled: gutter bg-canvas border-r border-ink/10 */
          <CodeSurface
            value={content}
            onValueChange={editor.onChange}
            language={lang}
            wordWrap={wordWrap}
            rootClassName="flex min-h-full bg-paper"
            gutterClassName="w-10 py-3 pr-2 select-none text-right text-[10px] text-ink/30 bg-canvas border-r border-ink/10 font-mono leading-[20px] flex-shrink-0"
            editorWrapperClassName="flex-1 p-3 overflow-x-auto min-w-0 bg-paper text-ink code-surface"
            editorClassName="focus:outline-none"
            editorStyle={{
              fontFamily: 'monospace',
              fontSize: `${fontSize}px`,
              lineHeight: '20px',
              backgroundColor: 'transparent',
              minHeight: '100%',
              color: 'var(--theme-ink)',
            }}
          />
        )}
      </div>

      {/* Bottom Status Bar - Desktop styled: bg-canvas border-t border-ink/10 */}
      <footer
        className="bg-canvas border-t border-ink/10 px-3 flex items-center justify-between text-[10px] text-ink/60 flex-shrink-0 font-mono"
        style={{
          height: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center space-x-3">
          <span>{linesCount} lines</span>
          <span>{content.length} chars</span>
          <span className="uppercase">{lang}</span>
        </div>
        <div className="flex items-center space-x-2">
          {editor.saveStatus === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin" />
              <span>Saving…</span>
            </>
          )}
          {editor.saveStatus === 'saved' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
              <span>Saved</span>
            </>
          )}
          {editor.saveStatus === 'error' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
              <span className="text-error">Save failed</span>
            </>
          )}
          {editor.saveStatus === 'idle' && file.path && <span className="truncate max-w-[140px]">{file.path}</span>}
        </div>
      </footer>

    </div>
  );
}
