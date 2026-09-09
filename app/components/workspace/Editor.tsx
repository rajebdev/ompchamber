import { useState, useEffect, useRef, useCallback } from 'react';
import { FileIcon } from '@/components/common/FileIcon';
import {
  Copy, Download, ZoomIn, ZoomOut, Maximize, X, Eye, EyeOff, Save, Check, ChevronDown, WrapText 
} from 'lucide-react';
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
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useScrollbarFade } from '@/hooks/useScrollbarFade';

interface EditorProps {
  className?: string;
  openedFiles: any[];
  activeFileId: number | null;
  onSelectFile: (id: number) => void;
  onCloseFile: (id: number) => void;
  refreshKey?: number;
  onFileSaved?: () => void;
}

function getDefaultContent(name: string) {
  if (name.endsWith('.md')) {
    return `# ${name.replace('.md', '')}\n\nThis is a mock markdown file.\n\n- You can edit this text\n- Click the eye icon above to toggle preview`;
  }
  if (name.endsWith('.tsx') || name.endsWith('.ts')) {
    const compName = name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
    return `import React from 'react';\n\nexport default function ${compName || 'Component'}() {\n  return (\n    <div>\n      Hello World\n    </div>\n  );\n}`;
  }
  if (name.endsWith('.json')) {
    return `{\n  "name": "omp-project",\n  "version": "1.0.0"\n}`;
  }
  if (name.endsWith('.css')) {
    return `.container {\n  display: flex;\n  flex-direction: column;\n}`;
  }
  return `Content for ${name}`;
}

function getLanguage(name: string) {
  if (name.endsWith('.tsx') || name.endsWith('.ts')) return 'tsx';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.md')) return 'markdown';
  return 'javascript';
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
  
  const [contents, setContents] = useState<Record<number, string>>({});
  const [previewMode, setPreviewMode] = useState<Record<number, boolean>>({});
  const [zoomLevel, setZoomLevel] = useState(12);
  const [isMaximized, setIsMaximized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [wordWrap, setWordWrap] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { isScrolling, handleScroll } = useScrollbarFade();

  // Tabs overflow logic
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [maxVisibleTabs, setMaxVisibleTabs] = useState(5);
  const [showDropdown, setShowDropdown] = useState(false);

  useOnClickOutside(dropdownRef, () => setShowDropdown(false));

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        // Average tab width ~ 150px, dropdown button ~ 40px
        const max = Math.max(1, Math.floor((width - 60) / 150));
        setMaxVisibleTabs(max);
      }
    });
    if (tabsContainerRef.current) {
      observer.observe(tabsContainerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      setContents({});
    }
  }, [refreshKey]);

  useEffect(() => {
    if (activeFile && contents[activeFile.id] === undefined) {
      if (activeFile.content !== undefined) {
        // Attachment chips carry the file content inline (no fetch needed).
        setContents(prev => ({ ...prev, [activeFile.id]: activeFile.content }));
      } else if (activeFile.path) {
        const params = new URLSearchParams({ path: activeFile.path });
        if (activeFile.root) params.set('root', activeFile.root);
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
        setPreviewMode(prev => ({ ...prev, [activeFile.id]: true }));
      }
    }
  }, [activeFile, contents]);

  const saveFileToDisk = useCallback((fileToSave: any, content: string) => {
    if (!fileToSave || !fileToSave.path) return;
    setSaveStatus('saving');
    const formData = new FormData();
    formData.append('actionType', 'save');
    formData.append('path', fileToSave.path);
    formData.append('content', content);
    if (fileToSave.root) formData.append('root', fileToSave.root);

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
    
    // Debounced auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveFileToDisk(activeFile, newContent);
    }, 800);
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Calculate visible and hidden tabs
  let visibleTabs: any[] = [];
  let hiddenTabs: any[] = [];

  if (openedFiles.length <= maxVisibleTabs) {
    visibleTabs = openedFiles;
  } else {
    const activeIndex = openedFiles.findIndex(f => f.id === activeFileId);
    const visibleSet = new Set<number>();
    
    if (activeIndex !== -1 && activeFileId !== null) {
      visibleSet.add(activeFileId);
    }

    for (let i = openedFiles.length - 1; i >= 0; i--) {
      if (visibleSet.size >= maxVisibleTabs) break;
      visibleSet.add(openedFiles[i].id);
    }

    visibleTabs = openedFiles.filter(f => visibleSet.has(f.id));
    hiddenTabs = openedFiles.filter(f => !visibleSet.has(f.id));
  }

  return (
    <div className={editorContainerClass}>
      {/* Tabs Header */}
      <div className="flex bg-ink/10 w-full relative border-b border-ink/10" ref={tabsContainerRef}>
        <div className="flex overflow-hidden">
          {visibleTabs.map(file => {
            const isActive = file.id === activeFileId;
            return (
              <div 
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 cursor-pointer border-r border-ink/10 min-w-[120px] max-w-[200px] group ${
                  isActive ? 'bg-paper border-t-2 border-t-ink text-ink' : 'bg-transparent border-t-2 border-t-transparent text-ink/60 hover:bg-paper/50'
                }`}
              >
                <FileIcon name={file.name} size={14} className={isActive ? '' : 'opacity-60'} />
                <span className="text-xs font-mono truncate flex-1">{file.name}</span>
                <div 
                  className={`p-0.5 rounded hover:bg-ink/10 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(file.id);
                  }}
                >
                  <X size={12} />
                </div>
              </div>
            );
          })}
        </div>
        
        {hiddenTabs.length > 0 && (
          <div className="relative flex items-center ml-auto bg-ink/10" ref={dropdownRef}>
            <button 
              className={`p-1.5 mx-1 rounded hover:bg-ink/10 text-ink/60 ${showDropdown ? 'bg-ink/10 text-ink' : ''}`}
              onClick={() => setShowDropdown(!showDropdown)}
              title="More open files"
            >
              <ChevronDown size={14} />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-paper border border-ink/10 rounded shadow-lg z-50 py-1">
                <div className="px-3 py-1 text-[10px] uppercase font-mono text-ink/40 border-b border-ink/10 mb-1">
                  Older Tabs
                </div>
                {hiddenTabs.map(file => (
                  <div
                    key={file.id}
                    onClick={() => {
                      onSelectFile(file.id);
                      setShowDropdown(false);
                    }}
                    className="flex items-center space-x-2 px-3 py-1.5 hover:bg-ink/5 cursor-pointer group"
                  >
                    <FileIcon name={file.name} size={14} className="opacity-60" />
                    <span className="text-xs font-mono truncate flex-1 text-ink/80">{file.name}</span>
                    <div 
                      className="p-0.5 rounded hover:bg-ink/10 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFile(file.id);
                        if (hiddenTabs.length === 1) setShowDropdown(false);
                      }}
                    >
                      <X size={12} className="text-ink/60" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeFile ? (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-ink/10 bg-paper">
            {/* Left status */}
            <div className="flex items-center space-x-2 text-xs font-mono text-ink/40">
              <span className="truncate max-w-[300px]" title={activeFile.path}>{activeFile.path}</span>
            </div>

            {/* Right actions */}
            <div className="flex items-center space-x-3 text-ink/40">
              <div className="flex items-center pr-3 border-r border-ink/10">
                <button
                  type="button"
                  onClick={() => saveFileToDisk(activeFile, currentContent)}
                  className="flex items-center justify-center rounded hover:bg-ink/5 transition-colors"
                  title="Save file (Ctrl+S)"
                >
                  {saveStatus === 'saving' ? (
                    <Save size={14} className="text-amber-500 animate-pulse" />
                  ) : saveStatus === 'saved' ? (
                    <Check size={14} className="text-success" />
                  ) : (
                    <Save size={14} className="hover:text-ink cursor-pointer" />
                  )}
                </button>
              </div>

              {isMd && (
                <div onClick={togglePreview} className="flex items-center pr-3 border-r border-ink/10">
                  {isPreview ? (
                    <EyeOff size={14} className="hover:text-ink cursor-pointer" />
                  ) : (
                    <Eye size={14} className="hover:text-ink cursor-pointer" />
                  )}
                </div>
              )}
              
              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <WrapText size={14} className={`cursor-pointer ${wordWrap ? 'text-ink' : 'hover:text-ink'}`} onClick={() => setWordWrap(!wordWrap)}  />
              </div>

              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <ZoomOut size={14} className="hover:text-ink cursor-pointer" onClick={() => setZoomLevel(z => Math.max(8, z - 1))}  />
                <ZoomIn size={14} className="hover:text-ink cursor-pointer" onClick={() => setZoomLevel(z => Math.min(24, z + 1))}  />
              </div>
              
              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <Copy size={14} className="hover:text-ink cursor-pointer" onClick={handleCopy}  />
                <Download size={14} className="hover:text-ink cursor-pointer" onClick={handleDownload}  />
              </div>

              <div className="flex items-center pl-1">
                <Maximize size={14} className="hover:text-ink cursor-pointer" onClick={() => setIsMaximized(!isMaximized)}  />
              </div>
            </div>
          </div>
          
          {/* Editor Content */}
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
                <div className="flex-1 min-w-max">
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
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink/40">
          <p className="font-mono text-sm">Select a tab to view content</p>
        </div>
      )}
    </div>
  );
}
