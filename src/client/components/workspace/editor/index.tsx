
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { FileIcon } from '@/client/components/common/FileIcon';
import CodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/themes/prism.css';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { useScrollbarFade } from '@/client/hooks/ui/scrollbar-fade';
import { EditorTabs } from '@/client/components/workspace/editor/Tabs';
import { EditorToolbar } from '@/client/components/workspace/editor/Toolbar';
import { getDefaultContent, getLanguage } from '@/shared/lib/code/editor-utils';
import { DiffPanel } from '@/client/components/workspace/diff-panel';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';
import { getSessionValue } from '@/shared/lib/workspace/session-state/store';

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
  
  const [contents, setContents] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode, previewReady] = useSessionState<Record<string | number, boolean>>('editor.previewMode', {});
  const [zoomLevel, setZoomLevel] = useSessionState<number>('editor.zoomLevel', 12);
  const [isMaximized, setIsMaximized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [wordWrap, setWordWrap] = useSessionState<boolean>('editor.wordWrap', true);
  const autoPreviewRef = useRef<number | null>(null);
  const { sessionId } = useSessionStateContext();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { isScrolling, handleScroll } = useScrollbarFade();

  useEffect(() => {
    if (refreshKey > 0) {
      setContents({});
    }
  }, [refreshKey]);

  useEffect(() => {
    const openIdStrings = new Set(openedFiles.map(f => String(f.id)));
    setContents(prev => {
      const keys = Object.keys(prev);
      if (keys.every(key => openIdStrings.has(key))) return prev;
      const next: Record<string, string> = {};
      for (const key of keys) {
        if (openIdStrings.has(key)) next[key] = prev[key];
      }
      return next;
    });
  }, [openedFiles]);

  useEffect(() => {
    if (activeFile && contents[activeFile.id] === undefined) {
      if (activeFile.content !== undefined) {
        setContents(prev => ({ ...prev, [activeFile.id]: activeFile.content }));
      } else if (activeFile.path) {
        const params = new URLSearchParams({ path: activeFile.path });
        if (activeFile.root) params.set('root', activeFile.root);
        if (activeFile.repo && activeFile.repo !== '.') params.set('repo', activeFile.repo);
        fetch(`/api/fs/read?${params.toString()}`)
          .then(res => res.json())
          .then(data => {
            if (data.content !== undefined) {
              setContents(prev => ({ ...prev, [activeFile.id]: data.content }));
            } else {
              setContents(prev => ({ ...prev, [activeFile.id]: getDefaultContent(activeFile.name) }));
            }
          })
          .catch(() => {
            setContents(prev => ({ ...prev, [activeFile.id]: getDefaultContent(activeFile.name) }));
          });
      } else {
        setContents(prev => ({ ...prev, [activeFile.id]: getDefaultContent(activeFile.name) }));
      }
      if (activeFile.name.endsWith('.md')) {
        autoPreviewRef.current = activeFile.id;
      }
    }
  }, [activeFile, contents]);

  // Auto-open Markdown preview only when no persisted choice exists for the
  // file; deferred until the session blob loaded so restored state wins.
  useEffect(() => {
    if (!previewReady) return;
    const id = autoPreviewRef.current;
    if (id === null) return;
    autoPreviewRef.current = null;
    const stored = getSessionValue<Record<string | number, boolean>>(sessionId, 'editor.previewMode');
    if (stored && stored[id] !== undefined) return;
    setPreviewMode(prev => (prev[id] === undefined ? { ...prev, [id]: true } : prev));
  }, [previewReady, activeFile]);

  const saveFileToDisk = useCallback((fileToSave: any, content: string) => {
    if (!fileToSave || !fileToSave.path) return;
    setSaveStatus('saving');
    const formData = new FormData();
    formData.append('actionType', 'save');
    formData.append('path', fileToSave.path);
    formData.append('content', content);
    if (fileToSave.root) formData.append('root', fileToSave.root);
    if (fileToSave.repo && fileToSave.repo !== '.') formData.append('repo', fileToSave.repo);

    fetch('/api/fs/action', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSaveStatus('saved');
          onFileSaved?.();
          setTimeout(() => setSaveStatus('idle'), 1500);
        } else {
          setSaveStatus('idle');
        }
      })
      .catch(() => setSaveStatus('idle'));
  }, [onFileSaved]);

  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    setContents(prev => ({ ...prev, [activeFile.id]: newContent }));
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveFileToDisk(activeFile, newContent);
    }, 800);
  };

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile && contents[activeFile.id] !== undefined) {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveFileToDisk(activeFile, contents[activeFile.id]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, contents, saveFileToDisk]);

  const togglePreview = () => {
    if (!activeFile) return;
    setPreviewMode(prev => ({ ...prev, [activeFile.id]: !prev[activeFile.id] }));
  };

  const handleCopy = () => {
    if (activeFile && contents[activeFile.id]) {
      navigator.clipboard.writeText(contents[activeFile.id]);
    }
  };

  const handleDownload = () => {
    if (activeFile && contents[activeFile.id]) {
      const blob = new Blob([contents[activeFile.id]], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeFile.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (openedFiles.length === 0) {
    return (
      <div className={`flex flex-col h-full bg-canvas items-center justify-center text-ink/40 ${className}`}>
        <FileIcon name="placeholder.txt" size={48} className="mb-4 opacity-20" />
        <p className="font-mono text-sm">Select a file to open</p>
      </div>
    );
  }

  const currentContent = activeFile ? (contents[activeFile.id] || '') : '';
  const isMd = activeFile?.name.endsWith('.md');
  const isPreview = activeFile ? previewMode[activeFile.id] : false;
  const lang = activeFile ? getLanguage(activeFile.name) : 'javascript';

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
              saveStatus={saveStatus}
              wordWrap={wordWrap}
              isMd={isMd}
              isPreview={isPreview}
              onSave={() => saveFileToDisk(activeFile, currentContent)}
              onTogglePreview={togglePreview}
              onToggleWordWrap={() => setWordWrap(!wordWrap)}
              onZoomIn={() => setZoomLevel(z => Math.min(24, z + 1))}
              onZoomOut={() => setZoomLevel(z => Math.max(8, z - 1))}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onToggleMaximize={() => setIsMaximized(!isMaximized)}
            />

            <div onScroll={handleScroll} className={`flex-1 overflow-auto bg-paper flex ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}>
              {(isMd && isPreview) ? (
                <div className="p-6 prose prose-sm max-w-4xl mx-auto font-sans flex-1" style={{ fontSize: `${zoomLevel}px` }}>
                  <MarkdownRenderer content={currentContent} />
                </div>
              ) : (
                <>
                  <div 
                    className="flex flex-col text-right pl-4 pr-3 select-none text-ink/30 font-mono border-r border-ink/10 bg-canvas sticky left-0 z-10" 
                    style={{ 
                      fontSize: zoomLevel, 
                      paddingTop: 16, 
                      paddingBottom: 16,
                      lineHeight: 1.5,
                      fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", Consolas, monospace',
                    }}
                  >
                    {currentContent.split('\n').map((_, i) => (
                      <div key={i + 1} className="min-w-[1.5rem]">{i + 1}</div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-max prism-code-surface">
                    <CodeEditor
                      value={currentContent}
                      onValueChange={handleContentChange}
                      highlight={code => Prism.highlight(code, Prism.languages[lang] || Prism.languages.javascript, lang)}
                      padding={16}
                      textareaClassName={`focus:outline-none ${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}`}
                      preClassName={`${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}`}
                      style={{
                        fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", Consolas, monospace',
                        fontSize: zoomLevel,
                        lineHeight: 1.5,
                        minHeight: '100%',
                      }}
                      className="font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
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
