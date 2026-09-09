import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  FileCode, 
  FilePlus, 
  FileText, 
  Search, 
  Globe, 
  Wrench,
  ChevronDown, 
  ChevronRight, 
  Check, 
  Copy, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import type { ToolCallData, ToolType } from '@/types';
import { copyToClipboard } from '@/hooks/useClipboard';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/themes/prism.css';

const getLanguage = (filename?: string) => {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js': return 'javascript';
    case 'jsx': return 'jsx';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'sh':
    case 'bash': return 'bash';
    case 'html': return 'markup';
    default: return 'javascript';
  }
};

const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const highlightCode = (code: string, language: string) => {
  if (!code) return '';
  try {
    const lang = Prism.languages[language] ? language : 'javascript';
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch (e) {
    return escapeHtml(code);
  }
};

interface ToolCallCardProps {
  tool: ToolCallData;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
}

function getToolIcon(type: ToolType) {
  switch (type) {
    case 'bash':
    case 'terminal':
      return <Terminal size={13} />;
    case 'edit_file':
      return <FileCode size={13} />;
    case 'create_file':
      return <FilePlus size={13} />;
    case 'read_file':
    case 'view_file':
      return <FileText size={13} />;
    case 'search_fs':
      return <Search size={13} />;
    case 'web_search':
      return <Globe size={13} />;
    default:
      return <Wrench size={13} />;
  }
}

export function ToolCallCard({ 
  tool, 
  isOpen: controlledIsOpen, 
  onToggle, 
  defaultExpanded = false
}: ToolCallCardProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultExpanded);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [lazyContent, setLazyContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const toolType = tool.type || 'terminal';
  const isReadFile = toolType === 'read_file' || toolType === 'view_file' || (tool.title && tool.title.toLowerCase().includes('read')) || (tool.title && tool.title.toLowerCase().includes('view file'));

  // Live stopwatch while the tool is still running: counts up from mount and
  // pauses once the tool call completes (status flips to success/error).
  const [elapsedSecs, setElapsedSecs] = useState(0);
  useEffect(() => {
    if (tool.status !== 'running') return;
    setElapsedSecs(0);
    const start = Date.now();
    const timer = setInterval(() => setElapsedSecs(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(timer);
  }, [tool.status, tool.id]);

  const formatElapsed = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  // Target file resolution
  const targetFilePath = tool.target || 
    (tool.diff && tool.diff.file) || 
    (typeof tool.input === 'object' && tool.input?.path) || 
    (typeof tool.input === 'string' && (tool.input.includes('.') || tool.input.includes('/')) ? tool.input : undefined) ||
    (tool.detail && (tool.detail.includes('.') || tool.detail.includes('/')) ? tool.detail : undefined);

  const commandOrInput = tool.command || (typeof tool.input === 'string' ? tool.input : tool.input ? JSON.stringify(tool.input, null, 2) : (!isReadFile && (tool.target || tool.detail)) || '');
  const outputText = tool.output || lazyContent || (tool.error ? `Error: ${tool.error}` : '');
  const status = tool.status || (tool.error ? 'error' : 'success');

  // If read_file is expanded but has no output yet, fetch content lazily
  useEffect(() => {
    if (isExpanded && isReadFile && targetFilePath && !tool.output && lazyContent === null && !loadingFile) {
      setLoadingFile(true);
      fetch(`/api/fs/read?path=${encodeURIComponent(targetFilePath)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.content !== undefined) {
            setLazyContent(data.content);
          } else {
            setLazyContent(`// Loaded file: ${targetFilePath}`);
          }
        })
        .catch(() => {
          setLazyContent(`// Loaded file: ${targetFilePath}`);
        })
        .finally(() => {
          setLoadingFile(false);
        });
    }
  }, [isExpanded, isReadFile, targetFilePath, tool.output, lazyContent, loadingFile]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(prev => !prev);
    }
  };

  const handleCopyCmd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (commandOrInput) {
      const success = await copyToClipboard(commandOrInput);
      if (success) {
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2000);
      }
    }
  };

  const handleCopyOutput = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (outputText) {
      const success = await copyToClipboard(outputText);
      if (success) {
        setCopiedOutput(true);
        setTimeout(() => setCopiedOutput(false), 2000);
      }
    }
  };

  const isRunning = status === 'running';
  // While still running, show only the header + live stopwatch: the input may
  // be incomplete and the output has not arrived yet. Full input/output render
  // once the tool call completes.
  const hasExpandableContent = !isRunning && Boolean(
    outputText || 
    commandOrInput || 
    tool.diff || 
    tool.error || 
    isReadFile || 
    targetFilePath
  );

  return (
    <div className={`w-full rounded-md transition-all font-sans text-[12px] overflow-hidden ${
      status === 'error' 
        ? 'bg-error/5' 
        : 'bg-transparent'
    }`}>
      {/* Header Row */}
      <div
        onClick={() => hasExpandableContent && handleToggle()}
        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors select-none ${
          hasExpandableContent ? 'hover:bg-ink/5 cursor-pointer rounded-md' : 'cursor-default'
        }`}
        aria-expanded={isExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (hasExpandableContent) handleToggle();
          }
        }}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2 flex-1">
          {/* Status / Tool Icon */}
          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
            status === 'error'
              ? 'bg-error/15 text-error'
              : status === 'running'
              ? 'bg-ink/10 text-ink'
              : 'bg-ink/5 text-ink/70'
          }`}>
            {status === 'running' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              tool.icon || getToolIcon(toolType)
            )}
          </div>

          {/* Title & Target */}
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1 pr-[50px]">
            {(() => {
              const fullTitle = tool.title || (isReadFile ? 'Read File' : tool.name || 'Tool Call');
              const sepIndex = fullTitle.indexOf(' — ');
              const name = sepIndex > -1 ? fullTitle.slice(0, sepIndex) : fullTitle;
              const detail = sepIndex > -1 ? fullTitle.slice(sepIndex + 3) : '';
              return (
                <>
                  <span className="font-semibold text-ink whitespace-nowrap flex-shrink-0 text-[12px] capitalize">
                    {name}
                  </span>
                  {detail && (
                    <span className="text-ink/55 font-mono text-[11px] truncate min-w-0 flex-1">
                      {detail}
                    </span>
                  )}
                </>
              );
            })()}
            {targetFilePath && (
              <span className="text-ink/70 truncate max-w-[180px] sm:max-w-[280px] text-[11px] font-mono bg-ink/5 px-1 rounded">
                {targetFilePath}
              </span>
            )}
            {!targetFilePath && tool.detail && (
              <span className="text-ink/60 truncate max-w-[200px] sm:max-w-[320px] text-[11px]">
                {tool.detail}
              </span>
            )}
          </div>
        </div>

        {/* Right metadata & shortcut buttons */}
        <div className="flex items-center space-x-2 flex-shrink-0 text-[11px] font-mono">
          {status === 'running' ? (
            <span className="inline-flex items-center space-x-1.5 text-ink/70">
              <Loader2 size={11} className="animate-spin" />
              <span>{formatElapsed(elapsedSecs)}</span>
            </span>
          ) : tool.duration || tool.time ? (
            <span className="text-ink/50">{tool.duration || tool.time}</span>
          ) : null}

          {status === 'error' && (
            <span className="inline-flex items-center text-error text-[10px] bg-error/10 border border-error/30 px-1.5 py-0.5 rounded font-medium">
              <AlertCircle size={10} className="mr-1" /> Exit 1
            </span>
          )}

          {tool.diff && (
            <span className="text-[10px] font-mono flex items-center space-x-1">
              {tool.diff.added !== undefined && (
                <span className="text-success">+{tool.diff.added}</span>
              )}
              {tool.diff.removed !== undefined && (
                <span className="text-error">-{tool.diff.removed}</span>
              )}
            </span>
          )}

          {hasExpandableContent && (
            <div className="flex items-center space-x-1 text-ink/50 ml-1">
              <span className="text-[10px] font-mono hidden sm:inline">
                {isExpanded ? 'Collapse' : 'Expand'}
              </span>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          )}
        </div>
      </div>

      {/* Expandable Detail Body */}
      {isExpanded && hasExpandableContent && (
        <div className="mt-2 mx-3 px-3.5 py-2.5 bg-ink/5 rounded-md space-y-2.5">
          {/* Read File Dedicated View */}
          {isReadFile && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-ink/60 uppercase tracking-wider">
                <div className="flex items-center space-x-1.5 truncate pr-2">
                  <FileText size={12} className="text-ink/70" />
                  <span className="truncate">{targetFilePath || 'File Content'}</span>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {outputText && (
                    <button
                      type="button"
                      onClick={handleCopyOutput}
                      className="flex items-center space-x-1 hover:text-ink transition-colors active:scale-95 cursor-pointer px-1.5 py-0.5 rounded hover:bg-ink/5 text-[11px]"
                    >
                      {copiedOutput ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                      <span>{copiedOutput ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              {loadingFile ? (
                <div className="bg-paper p-3 rounded text-[11px] font-mono text-ink/50 flex items-center space-x-2">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Loading file content...</span>
                </div>
              ) : outputText ? (
                <div className="bg-paper rounded text-[11px] font-mono overflow-x-auto max-h-80 scrollbar-overlay-container scrollbar-overlay-static overscroll-contain flex items-start">
                  {/* Line numbers gutter */}
                  <div className="py-2 pl-2.5 pr-2 select-none text-right text-[11px] text-ink/30 bg-ink/10 border-r border-ink/10 font-mono leading-relaxed flex-shrink-0">
                    {outputText.split('\n').map((_, idx) => (
                      <div key={idx}>{idx + 1}</div>
                    ))}
                  </div>
                  {/* Code body */}
                  <div 
                    className="p-2 flex-1 whitespace-pre leading-relaxed text-ink/90 select-text overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: highlightCode(outputText, getLanguage(targetFilePath)) }}
                  />
                </div>
              ) : (
                <div className="bg-paper p-2.5 rounded text-[11px] font-mono text-ink/60">
                  <span>File is ready for inspection.</span>
                </div>
              )}
            </div>
          )}

          {/* Command / Input preview (for non-read_file or when command is present) */}
          {!isReadFile && commandOrInput && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-ink/60 uppercase tracking-wider">
                <span>Input / Command</span>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  className="flex items-center space-x-1 hover:text-ink transition-colors active:scale-95 cursor-pointer px-1 py-0.5 rounded hover:bg-ink/5"
                >
                  {copiedCmd ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                  <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="bg-ink/10 text-ink p-2 rounded text-[11px] sm:text-[12px] font-mono overflow-x-auto whitespace-pre-wrap break-all shadow-inner select-text">
                <span className="text-warning font-bold select-none mr-1.5">$</span>
                <span dangerouslySetInnerHTML={{ __html: highlightCode(commandOrInput, 'bash') }} />
              </div>
            </div>
          )}

          {/* Diff preview if file change */}
          {tool.diff && tool.diff.diffText && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-ink/60 uppercase tracking-wider">
                <div className="flex items-center space-x-1.5 truncate pr-2">
                  <FileCode size={11} className="text-ink/70" />
                  <span className="truncate">File Diff: {tool.diff.file}</span>
                </div>
              </div>
              <div className="bg-ink/10 p-2 rounded text-[11px] sm:text-[12px] font-mono overflow-x-auto max-h-48 whitespace-pre leading-relaxed select-text">
                {tool.diff.diffText.split('\n').map((line, idx) => {
                  const isAdd = line.startsWith('+');
                  const isDel = line.startsWith('-');
                  const isMeta = line.startsWith('@@');
                  const lang = getLanguage(tool.diff?.file);

                  let codeHtml = '';
                  if (isAdd || isDel) {
                    const prefix = line.substring(0, 1);
                    const code = line.substring(1);
                    const hlCode = highlightCode(code, lang);
                    const prefixClass = isAdd ? 'text-success' : 'text-error';
                    codeHtml = `<span class="select-none ${prefixClass} mr-2 font-bold">${prefix}</span>${hlCode}`;
                  } else if (isMeta) {
                    codeHtml = `<span class="text-meta">${escapeHtml(line)}</span>`;
                  } else {
                    const prefix = line.substring(0, 1) === ' ' ? ' ' : '';
                    const code = prefix === ' ' ? line.substring(1) : line;
                    const hlCode = highlightCode(code, lang);
                    codeHtml = `<span class="select-none opacity-40 mr-2">${prefix}</span>${hlCode}`;
                  }

                  return (
                    <div
                      key={idx}
                      className={
                        isAdd
                          ? 'bg-success-bg px-1 rounded-xs'
                          : isDel
                          ? 'bg-error/10 px-1 rounded-xs'
                          : 'px-1'
                      }
                      dangerouslySetInnerHTML={{ __html: codeHtml }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Output / stdout logs (for non-read_file) */}
          {!isReadFile && outputText && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-ink/60 uppercase tracking-wider">
                <span>Output / Response</span>
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="flex items-center space-x-1 hover:text-ink transition-colors active:scale-95 cursor-pointer px-1 py-0.5 rounded hover:bg-ink/5"
                >
                  {copiedOutput ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                  <span>{copiedOutput ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div 
                className="bg-paper p-2 rounded text-[11px] sm:text-[12px] font-mono overflow-x-auto max-h-80 scrollbar-overlay-container scrollbar-overlay-static overscroll-contain whitespace-pre break-words leading-relaxed text-ink/90 select-text"
                dangerouslySetInnerHTML={{ __html: highlightCode(outputText, 'javascript') }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

