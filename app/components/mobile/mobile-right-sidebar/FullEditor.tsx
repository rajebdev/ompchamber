import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import CodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-bash';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { EditorHeader } from '@/components/mobile/mobile-right-sidebar/Header';
import { useScrollbarFade } from '@/hooks/ui/scrollbar-fade';

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

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'css':
      return 'css';
    case 'sh':
    case 'bash':
      return 'bash';
    default:
      return 'javascript';
  }
}

export function MobileFullEditor({ file, onClose, onFileSaved }: MobileFullEditorProps) {
  const [content, setContent] = useState<string>(file.content || '');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(file.name.endsWith('.md'));
  const [fontSize, setFontSize] = useState(12);
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { isScrolling, handleScroll } = useScrollbarFade();

  const isMd = file.name.endsWith('.md');
  const lang = getLanguage(file.name);
  

  // Load real content from the API when the caller did not inline it. A failed
  // read reports the failure: substituting placeholder text would present
  // invented file contents as the real file.
  useEffect(() => {
    if (file.content) {
      setContent(file.content);
      setLoadError(null);
      return;
    }
    if (!file.path) {
      setContent('');
      setLoadError('No file path supplied for this attachment.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ path: file.path });
    if (file.root) params.set('root', file.root);
    if (file.repo && file.repo !== '.') params.set('repo', file.repo);
    fetch(`/api/fs/read?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data.content !== 'string') {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        return data.content as string;
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContent('');
        setLoadError(err instanceof Error ? err.message : 'Failed to read file');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file.path, file.name, file.content, file.root, file.repo]);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Persist to disk through the same endpoint the desktop editor uses; edits
  // used to live only in component state and were lost on close.
  const saveFileToDisk = useCallback(async (text: string) => {
    if (!file.path) return;
    setSaveStatus('saving');
    const formData = new FormData();
    formData.append('actionType', 'save');
    formData.append('path', file.path);
    formData.append('content', text);
    if (file.root) formData.append('root', file.root);
    if (file.repo && file.repo !== '.') formData.append('repo', file.repo);
    try {
      const res = await fetch('/api/fs/action', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);
      const saved = res.ok && Boolean(data?.success);
      setSaveStatus(saved ? 'saved' : 'error');
      if (saved) onFileSaved?.();
    } catch {
      setSaveStatus('error');
    }
  }, [file.path, file.root, file.repo, onFileSaved]);

  // Pending debounced write. The timer handle and its payload travel together
  // so the unmount flush below can cancel exactly the write it then performs.
  const pendingSaveRef = useRef<{ timer: number; content: string } | null>(null);
  const saveRef = useRef(saveFileToDisk);
  saveRef.current = saveFileToDisk;

  const handleContentChange = (next: string) => {
    setContent(next);
    if (!file.path) return;
    if (pendingSaveRef.current !== null) window.clearTimeout(pendingSaveRef.current.timer);
    const timer = window.setTimeout(() => {
      pendingSaveRef.current = null;
      void saveRef.current(next);
    }, 800);
    pendingSaveRef.current = { timer, content: next };
  };

  // Closing the overlay within the debounce window must not drop the edit: the
  // pending write is flushed on unmount, and the request outlives the render.
  useEffect(() => () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingSaveRef.current = null;
    void saveRef.current(pending.content);
  }, []);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = window.setTimeout(() => setSaveStatus('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightCode = (code: string) => {
    try {
      const grammar = Prism.languages[lang] || Prism.languages.javascript;
      return Prism.highlight(code, grammar, lang);
    } catch {
      return code;
    }
  };

  const linesCount = content.split('\n').length;

  return (
    <div className="fixed inset-x-0 top-0 h-dvh z-[60] bg-paper flex flex-col font-mono text-xs select-none">
      
      <EditorHeader
        fileName={file.name}
        isMarkdown={isMd}
        isPreview={isPreview}
        wordWrap={wordWrap}
        copied={copied}
        onClose={onClose}
        onTogglePreview={() => setIsPreview(!isPreview)}
        onToggleWrap={() => setWordWrap(!wordWrap)}
        onZoomOut={() => setFontSize(prev => Math.max(10, prev - 1))}
        onZoomIn={() => setFontSize(prev => Math.min(18, prev + 1))}
        onCopy={handleCopy}
        onDownload={handleDownload}
      />

      {/* Editor Content Area - Desktop styled: bg-paper text-ink */}
      <div onScroll={handleScroll} className={`flex-1 min-h-0 overflow-auto relative bg-paper text-ink select-text ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-ink/40 text-xs gap-2">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading file content...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <AlertTriangle size={20} className="text-error" />
            <span className="text-xs text-error font-sans">Could not read {file.name}</span>
            <span className="text-[11px] text-ink/50 font-mono break-all">{loadError}</span>
          </div>
        ) : isMd && isPreview ? (
          /* Markdown Preview Mode */
          <div className="p-4 bg-paper text-ink min-h-full font-sans prose prose-sm max-w-none">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          /* Code Editor with Line Numbers - Desktop styled: gutter bg-canvas border-r border-ink/10 */
          <div className="flex min-h-full bg-paper">
            {/* Line numbers gutter */}
            <div className="w-10 py-3 pr-2 select-none text-right text-[10px] text-ink/30 bg-canvas border-r border-ink/10 font-mono leading-[20px] flex-shrink-0">
              {Array.from({ length: linesCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Simple Code Editor area */}
            <div className="flex-1 p-3 overflow-x-auto min-w-0 bg-paper text-ink prism-code-surface">
              <CodeEditor
                value={content}
                onValueChange={handleContentChange}
                highlight={highlightCode}
                padding={0}
                textareaClassName={`focus:outline-none ${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}`}
                preClassName={`${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}`}
                style={{
                  fontFamily: 'monospace',
                  fontSize: `${fontSize}px`,
                  lineHeight: '20px',
                  backgroundColor: 'transparent',
                  minHeight: '100%',
                  color: 'var(--theme-ink)'
                }}
                className="focus:outline-none"
              />
            </div>
          </div>
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
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin" />
              <span>Saving…</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
              <span className="text-error">Save failed</span>
            </>
          )}
          {saveStatus === 'idle' && file.path && <span className="truncate max-w-[140px]">{file.path}</span>}
        </div>
      </footer>

    </div>
  );
}
