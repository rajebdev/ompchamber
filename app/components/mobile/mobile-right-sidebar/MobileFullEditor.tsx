import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Copy, 
  Check, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  EyeOff, 
  X,
  FileCode,
  FileText
} from 'lucide-react';
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
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface MobileFullEditorProps {
  file: {
    name: string;
    path?: string;
    content?: string;
  };
  onClose: () => void;
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

function getDefaultFileContent(filename: string): string {
  if (filename.endsWith('.md')) {
    return `# ${filename}\n\n# System Configuration\n\nOMPChamber workspace file.\n\n- Runtime: Bun v1.2.4\n- Mode: Edge Runtime\n\n\`\`\`bash\nbun run build\n\`\`\``;
  }
  return `// ${filename}\nimport React from 'react';\n\nexport function Component() {\n  return <div>Loaded content from workspace</div>;\n}\n`;
}

export function MobileFullEditor({ file, onClose }: MobileFullEditorProps) {
  const [content, setContent] = useState<string>(file.content || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreview, setIsPreview] = useState(file.name.endsWith('.md'));
  const [fontSize, setFontSize] = useState(12);
  const [copied, setCopied] = useState(false);

  const lang = getLanguage(file.name);
  const isMd = file.name.endsWith('.md');

  // Load real content from API if path exists and content was not provided
  useEffect(() => {
    if (!file.content && file.path) {
      setIsLoading(true);
      fetch(`/api/fs/read?path=${encodeURIComponent(file.path)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.content !== undefined) {
            setContent(data.content);
          } else {
            setContent(getDefaultFileContent(file.name));
          }
        })
        .catch(() => {
          setContent(getDefaultFileContent(file.name));
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!file.content) {
      setContent(getDefaultFileContent(file.name));
    }
  }, [file.path, file.name, file.content]);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

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
    <div className="fixed inset-0 z-[60] bg-[#faf8f3] flex flex-col font-mono text-xs select-none">
      
      {/* Top Header Bar - Desktop styled: bg-[#f4f1ea] border-b border-[#141310]/10 */}
      <header className="h-12 bg-[#f4f1ea] border-b border-[#141310]/10 flex items-center justify-between px-3 flex-shrink-0">
        
        {/* Left: Back/Close button + File icon and name (removed file type/language label) */}
        <div className="flex items-center space-x-2 min-w-0 pr-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#141310]/10 text-[#141310] transition-colors active:scale-90 flex-shrink-0 cursor-pointer"
            title="Close editor"
            aria-label="Close editor"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>

          <div className="flex items-center space-x-1.5 truncate">
            {isMd ? <FileText size={15} className="text-[#141310]/70 flex-shrink-0" /> : <FileCode size={15} className="text-[#141310]/70 flex-shrink-0" />}
            <span className="font-semibold text-xs text-[#141310] truncate">{file.name}</span>
          </div>
        </div>

        {/* Right action tools: Preview, Zoom, Copy, Download, Close */}
        <div className="flex items-center space-x-1 text-[#141310]/70 flex-shrink-0">
          
          {/* Markdown preview toggle */}
          {isMd && (
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={`p-1.5 rounded hover:bg-[#141310]/10 transition-colors cursor-pointer ${isPreview ? 'bg-[#141310] text-[#f4f1ea]' : ''}`}
              title={isPreview ? 'View code' : 'Preview markdown'}
            >
              {isPreview ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}

          {/* Zoom controls */}
          <button
            type="button"
            onClick={() => setFontSize(prev => Math.max(10, prev - 1))}
            className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors cursor-pointer"
            title="Decrease font size"
          >
            <ZoomOut size={15} />
          </button>

          <button
            type="button"
            onClick={() => setFontSize(prev => Math.min(18, prev + 1))}
            className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors cursor-pointer"
            title="Increase font size"
          >
            <ZoomIn size={15} />
          </button>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors cursor-pointer"
            title="Copy content"
          >
            {copied ? <Check size={15} className="text-emerald-700" /> : <Copy size={15} />}
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-[#141310]/10 transition-colors cursor-pointer"
            title="Download file"
          >
            <Download size={15} />
          </button>

          {/* Close X */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#141310]/10 text-[#141310]/80 transition-colors ml-1 cursor-pointer"
            title="Close editor"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Editor Content Area - Desktop styled: bg-[#faf8f3] text-[#141310] */}
      <div className="flex-1 overflow-auto relative bg-[#faf8f3] text-[#141310] select-text">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-[#141310]/40 text-xs">
            Loading file content...
          </div>
        ) : isMd && isPreview ? (
          /* Markdown Preview Mode */
          <div className="p-4 bg-[#faf8f3] text-[#141310] min-h-full font-sans prose prose-sm max-w-none">
            <Markdown rehypePlugins={[rehypeRaw]}>{content}</Markdown>
          </div>
        ) : (
          /* Code Editor with Line Numbers - Desktop styled: gutter bg-[#f4f1ea] border-r border-[#141310]/10 */
          <div className="flex min-h-full bg-[#faf8f3]">
            {/* Line numbers gutter */}
            <div className="w-10 py-3 pr-2 select-none text-right text-[10px] text-[#141310]/30 bg-[#f4f1ea] border-r border-[#141310]/10 font-mono leading-[20px] flex-shrink-0">
              {Array.from({ length: linesCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Simple Code Editor area */}
            <div className="flex-1 p-3 overflow-x-auto min-w-0 bg-[#faf8f3] text-[#141310]">
              <CodeEditor
                value={content}
                onValueChange={code => setContent(code)}
                highlight={highlightCode}
                padding={0}
                style={{
                  fontFamily: 'monospace',
                  fontSize: `${fontSize}px`,
                  lineHeight: '20px',
                  backgroundColor: 'transparent',
                  minHeight: '100%',
                  color: '#141310'
                }}
                className="focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar - Desktop styled: bg-[#f4f1ea] border-t border-[#141310]/10 */}
      <footer className="h-7 bg-[#f4f1ea] border-t border-[#141310]/10 px-3 flex items-center justify-between text-[10px] text-[#141310]/60 flex-shrink-0 font-mono">
        <div className="flex items-center space-x-3">
          <span>{linesCount} lines</span>
          <span>{content.length} chars</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          <span>Bun v1.2.4</span>
        </div>
      </footer>

    </div>
  );
}
