import { useState } from 'react';
import { Terminal, FileCode, FileText, Search, Globe, Wrench, Copy, Check } from 'lucide-react';
import type { ToolCallData, ToolType } from '@/types';
import { copyToClipboard } from '@/hooks/useClipboard';
import { ToolCardShell } from '@/components/workspace/chat-timeline/tool-renderers/ToolCardShell';
import { ReadPanel } from '@/components/workspace/chat-timeline/tool-renderers/ReadPanel';
import { DiffView } from '@/components/workspace/chat-timeline/tool-renderers/DiffView';
import { ToolDetailsPanel, hasToolDetailsPanel } from '@/components/workspace/chat-timeline/tool-renderers';
import { toTitleCase } from '@/components/workspace/chat-timeline/tool-renderers/title-case';
import { FallbackOutput } from '@/components/workspace/chat-timeline/tool-renderers/FallbackOutput';

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
      return <Terminal size={14} />;
    case 'edit':
    case 'write':
    case 'edit_file':
    case 'create_file':
      return <FileCode size={14} />;
    case 'read':
    case 'read_file':
    case 'view_file':
      return <FileText size={14} />;
    case 'glob':
    case 'grep':
    case 'search_fs':
      return <Search size={14} />;
    case 'web_search':
      return <Globe size={14} />;
    default:
      return <Wrench size={14} />;
  }
}

function isReadTool(tool: ToolCallData): boolean {
  const t = tool.type;
  return t === 'read' || t === 'read_file' || t === 'view_file' || (tool.title ?? '').toLowerCase().includes('read');
}

function resolveTargetFile(tool: ToolCallData): string | undefined {
  if (tool.target) return tool.target;
  if (tool.diff?.file) return tool.diff.file;
  if (tool.input && typeof tool.input === 'object' && typeof tool.input.path === 'string') return tool.input.path;
  if (typeof tool.input === 'string' && (tool.input.includes('.') || tool.input.includes('/'))) return tool.input;
  if (tool.detail && (tool.detail.includes('.') || tool.detail.includes('/'))) return tool.detail;
  return undefined;
}

function commandOrInputOf(tool: ToolCallData): string {
  if (tool.command) return tool.command;
  if (typeof tool.input === 'string') return tool.input;
  if (tool.input && typeof tool.input === 'object') return JSON.stringify(tool.input, null, 2);
  if (!isReadTool(tool) && (tool.target || tool.detail)) return tool.target || tool.detail || '';
  return '';
}

function diffTextOf(tool: ToolCallData): string | undefined {
  if (tool.diff?.diffText) return tool.diff.diffText;
  const details = tool.details;
  if (details && typeof details === 'object') {
    if (typeof details.patch === 'string') return details.patch;
    if (typeof details.diff === 'string') return details.diff;
  }
  return undefined;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
      {children}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function ToolCallCard({ tool, isOpen, onToggle, defaultExpanded = false }: ToolCallCardProps) {
  const isReadFile = isReadTool(tool);
  const hasPanel = hasToolDetailsPanel(tool);
  const targetFilePath = resolveTargetFile(tool);
  const commandOrInput = commandOrInputOf(tool);
  const outputText = tool.output || (tool.error ? `Error: ${tool.error}` : '');
  const diffText = diffTextOf(tool);

  const title = toTitleCase(tool.title || (isReadFile ? 'Read File' : tool.name || 'Tool Call'));
  const subtitle = targetFilePath || (tool.detail && !targetFilePath ? tool.detail : undefined);

  const meta = tool.duration || tool.time ? (
    <span className="font-mono text-[10px] text-ink/40">{tool.duration || tool.time}</span>
  ) : null;

  return (
    <ToolCardShell
      tool={tool}
      icon={tool.icon || getToolIcon(tool.type)}
      title={title}
      subtitle={subtitle}
      meta={meta}
      isOpen={isOpen}
      onToggle={onToggle}
      defaultExpanded={defaultExpanded}
    >
      {isReadFile && (
        <ReadPanel targetFilePath={targetFilePath} output={outputText} />
      )}

      {!isReadFile && !hasPanel && commandOrInput && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Input</SectionLabel>
            <CopyButton text={commandOrInput} label="Copy" />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink/80 select-text">
            {commandOrInput}
          </pre>
        </div>
      )}

      {diffText && (
        <div className="space-y-1.5">
          <SectionLabel>Diff</SectionLabel>
          <DiffView text={diffText} />
        </div>
      )}

      <ToolDetailsPanel tool={tool} />

      {!isReadFile && !hasPanel && outputText && (
        <FallbackOutput text={outputText} />
      )}
    </ToolCardShell>
  );
}
