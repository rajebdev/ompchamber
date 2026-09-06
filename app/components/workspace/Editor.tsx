import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, Copy, Download, ZoomIn, ZoomOut, Maximize, ExternalLink, X, Eye, EyeOff, Save, Check, ChevronDown 
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
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

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
  const [zoomLevel, setZoomLevel] = useState(13);
  const [isMaximized, setIsMaximized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      if (activeFile.path) {
        fetch(`/api/fs/read?path=${encodeURIComponent(activeFile.path)}`)
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
      <div className={`flex flex-col h-full bg-[#f4f1ea] items-center justify-center text-[#141310]/40 ${className}`}>
        <FileText size={48} className="mb-4 opacity-20" />
        <p className="font-mono text-sm">Select a file to open</p>
      </div>
    );
  }

  const currentContent = activeFile ? (contents[activeFile.id] || '') : '';
  const isMd = activeFile?.name.endsWith('.md');
  const isPreview = activeFile ? previewMode[activeFile.id] : false;
  const lang = activeFile ? getLanguage(activeFile.name) : 'javascript';

  const editorContainerClass = isMaximized 
    ? 'fixed inset-0 z-50 flex flex-col bg-[#f4f1ea]' 
    : `flex flex-col h-full bg-[#f4f1ea] ${className}`;

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
      <div className="flex bg-[#e8e4db] w-full relative border-b border-[#141310]/10" ref={tabsContainerRef}>
        <div className="flex overflow-hidden">
          {visibleTabs.map(file => {
            const isActive = file.id === activeFileId;
            return (
              <div 
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 cursor-pointer border-r border-[#141310]/10 min-w-[120px] max-w-[200px] group ${
                  isActive ? 'bg-[#faf8f3] border-t-2 border-t-[#141310] text-[#141310]' : 'bg-transparent border-t-2 border-t-transparent text-[#141310]/60 hover:bg-[#faf8f3]/50'
                }`}
              >
                <FileText size={14} className={isActive ? 'text-[#141310]' : 'text-[#141310]/60'} />
                <span className="text-xs font-mono truncate flex-1">{file.name}</span>
                <div 
                  className={`p-0.5 rounded hover:bg-[#141310]/10 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
          <div className="relative flex items-center ml-auto bg-[#e8e4db]" ref={dropdownRef}>
            <button 
              className={`p-1.5 mx-1 rounded hover:bg-[#141310]/10 text-[#141310]/60 ${showDropdown ? 'bg-[#141310]/10 text-[#141310]' : ''}`}
              onClick={() => setShowDropdown(!showDropdown)}
              title="More open files"
            >
              <ChevronDown size={14} />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#faf8f3] border border-[#141310]/10 rounded shadow-lg z-50 py-1">
                <div className="px-3 py-1 text-[10px] uppercase font-mono text-[#141310]/40 border-b border-[#141310]/10 mb-1">
                  Older Tabs
                </div>
                {hiddenTabs.map(file => (
                  <div
                    key={file.id}
                    onClick={() => {
                      onSelectFile(file.id);
                      setShowDropdown(false);
                    }}
                    className="flex items-center space-x-2 px-3 py-1.5 hover:bg-[#141310]/5 cursor-pointer group"
                  >
                    <FileText size={14} className="text-[#141310]/60" />
                    <span className="text-xs font-mono truncate flex-1 text-[#141310]/80">{file.name}</span>
                    <div 
                      className="p-0.5 rounded hover:bg-[#141310]/10 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFile(file.id);
                        if (hiddenTabs.length === 1) setShowDropdown(false);
                      }}
                    >
                      <X size={12} className="text-[#141310]/60" />
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
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#141310]/10 bg-[#faf8f3]">
            {/* Left status / save button */}
            <div className="flex items-center space-x-2 text-xs font-mono text-[#141310]/60">
              <button
                type="button"
                onClick={() => saveFileToDisk(activeFile, currentContent)}
                className="flex items-center space-x-1.5 px-2 py-0.5 rounded hover:bg-[#141310]/5 transition-colors text-[11px]"
                title="Save file (Ctrl+S)"
              >
                {saveStatus === 'saving' ? (
                  <span className="text-amber-600 font-sans">Saving...</span>
                ) : saveStatus === 'saved' ? (
                  <>
                    <Check size={12} className="text-emerald-700" />
                    <span className="text-emerald-700">Saved</span>
                  </>
                ) : (
                  <>
                    <Save size={12} />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>

            {/* Right actions */}
            <div className="flex items-center space-x-3 text-[#141310]/40">
              {isMd && (
                <div onClick={togglePreview} className="flex items-center pr-3 border-r border-[#141310]/10">
                  {isPreview ? (
                    <EyeOff size={14} className="hover:text-[#141310] cursor-pointer" />
                  ) : (
                    <Eye size={14} className="hover:text-[#141310] cursor-pointer" />
                  )}
                </div>
              )}
              
              <div className="flex items-center space-x-2 pr-3 border-r border-[#141310]/10">
                <ZoomOut size={14} className="hover:text-[#141310] cursor-pointer" onClick={() => setZoomLevel(z => Math.max(8, z - 1))} />
                <ZoomIn size={14} className="hover:text-[#141310] cursor-pointer" onClick={() => setZoomLevel(z => Math.min(24, z + 1))} />
              </div>
              
              <div className="flex items-center space-x-2 pr-3 border-r border-[#141310]/10">
                <Copy size={14} className="hover:text-[#141310] cursor-pointer" onClick={handleCopy} />
                <Download size={14} className="hover:text-[#141310] cursor-pointer" onClick={handleDownload} />
                <ExternalLink size={14} className="hover:text-[#141310] cursor-pointer" />
              </div>
              <div className="flex items-center pl-1">
                <Maximize size={14} className="hover:text-[#141310] cursor-pointer" onClick={() => setIsMaximized(!isMaximized)} />
              </div>
            </div>
          </div>
          
          {/* Editor Content */}
          <div className="flex-1 overflow-auto bg-[#faf8f3] flex">
            {(isMd && isPreview) ? (
              <div className="p-6 prose prose-sm max-w-4xl mx-auto font-sans flex-1" style={{ fontSize: `${zoomLevel}px` }}>
                <Markdown rehypePlugins={[rehypeRaw]}>{currentContent}</Markdown>
              </div>
            ) : (
              <>
                <div 
                  className="flex flex-col text-right pl-4 pr-3 select-none text-[#141310]/30 font-mono border-r border-[#141310]/10 bg-[#f4f1ea] sticky left-0 z-10" 
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
                    textareaClassName="focus:outline-none !whitespace-pre !break-normal"
                    preClassName="!whitespace-pre !break-normal"
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
        <div className="flex-1 flex items-center justify-center text-[#141310]/40">
          <p className="font-mono text-sm">Select a tab to view content</p>
        </div>
      )}
    </div>
  );
}
