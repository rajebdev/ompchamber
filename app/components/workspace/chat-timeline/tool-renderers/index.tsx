import type { ReactNode } from 'react';
import type { ToolCallData } from '@/types';
import { TaskResult } from '@/components/workspace/chat-timeline/tool-renderers/panels/TaskResult';
import { Todo } from '@/components/workspace/chat-timeline/tool-renderers/panels/Todo';
import { Lsp } from '@/components/workspace/chat-timeline/tool-renderers/panels/Lsp';
import { WebSearch } from '@/components/workspace/chat-timeline/tool-renderers/panels/WebSearch';
import { Eval } from '@/components/workspace/chat-timeline/tool-renderers/panels/Eval';
import { Github } from '@/components/workspace/chat-timeline/tool-renderers/panels/Github';
import { Checkpoint } from '@/components/workspace/chat-timeline/tool-renderers/panels/Checkpoint';
import { Bash } from '@/components/workspace/chat-timeline/tool-renderers/panels/Bash';
import { SearchTool } from '@/components/workspace/chat-timeline/tool-renderers/panels/SearchTool';
import { SecurityScan } from '@/components/workspace/chat-timeline/tool-renderers/panels/SecurityScan';
import { Hub } from '@/components/workspace/chat-timeline/tool-renderers/panels/Hub';
import { ContextNotes } from '@/components/workspace/chat-timeline/tool-renderers/panels/ContextNotes';
import { Memory } from '@/components/workspace/chat-timeline/tool-renderers/panels/Memory';
import { Debug } from '@/components/workspace/chat-timeline/tool-renderers/panels/Debug';
import { Goal } from '@/components/workspace/chat-timeline/tool-renderers/panels/Goal';
import { AstEdit } from '@/components/workspace/chat-timeline/tool-renderers/panels/AstEdit';
import { Resolve } from '@/components/workspace/chat-timeline/tool-renderers/panels/Resolve';
import { ManageSkill } from '@/components/workspace/chat-timeline/tool-renderers/panels/ManageSkill';
import { SearchFs } from '@/components/workspace/chat-timeline/tool-renderers/panels/SearchFs';
import { Ask } from '@/components/workspace/chat-timeline/tool-renderers/panels/Ask';
import { Think } from '@/components/workspace/chat-timeline/tool-renderers/panels/Think';
import { Read } from '@/components/workspace/chat-timeline/tool-renderers/panels/Read';
import { Edit } from '@/components/workspace/chat-timeline/tool-renderers/panels/Edit';

function resolveTargetFile(tool: ToolCallData): string | undefined {
  if (tool.target) return tool.target;
  if (tool.diff?.file) return tool.diff.file;
  if (tool.input && typeof tool.input === 'object') {
    const obj = tool.input as Record<string, unknown>;
    if (typeof obj.path === 'string') return obj.path;
    if (typeof obj.TargetFile === 'string') return obj.TargetFile;
    if (typeof obj.targetFile === 'string') return obj.targetFile;
    if (typeof obj.FilePath === 'string') return obj.FilePath;
    if (typeof obj.filePath === 'string') return obj.filePath;
    if (typeof obj.AbsolutePath === 'string') return obj.AbsolutePath;
    if (typeof obj.absolutePath === 'string') return obj.absolutePath;
    if (typeof obj.file === 'string') return obj.file;
  }
  if (typeof tool.input === 'string' && (tool.input.includes('.') || tool.input.includes('/'))) {
    return tool.input;
  }
  if (tool.detail && (tool.detail.includes('.') || tool.detail.includes('/'))) {
    return tool.detail;
  }
  return undefined;
}

export function resolveToolKey(tool: ToolCallData): string {
  // 1. Detect oh-my-pi virtual device calls (e.g. xd://lsp, xd://ast_edit, xd://resolve)
  const details = tool.details as Record<string, any> | undefined;
  if (details?.xdev?.tool && typeof details.xdev.tool === 'string') {
    return details.xdev.tool.toLowerCase();
  }

  const rawTarget = (tool.target || '').toLowerCase();
  const inputPath = typeof tool.input === 'object' && tool.input !== null && typeof (tool.input as any).path === 'string'
    ? ((tool.input as any).path as string).toLowerCase()
    : '';

  const xdTarget = rawTarget.startsWith('xd://') ? rawTarget.slice(5) : inputPath.startsWith('xd://') ? inputPath.slice(5) : '';
  if (xdTarget) {
    const dev = xdTarget.split(/[/?#]/)[0].trim();
    if (dev) return dev;
  }

  const rawName = (tool.name || '').toLowerCase();
  const rawType = (tool.type || '').toLowerCase();
  const rawTitle = (tool.title || '').toLowerCase();

  // If specific tool name is given (e.g. 'todo', 'eval', 'hub', 'grep', 'glob', 'read', 'write', 'edit')
  if (rawName && rawName !== 'tool' && rawName !== 'custom') {
    return rawName;
  }

  // Check title prefix if e.g. "grep — .", "read — app/...", "write — app/..."
  const titlePrefix = rawTitle.split(/[\s—\-:]+/)[0]?.trim();
  if (['grep', 'glob', 'read', 'write', 'edit', 'bash', 'terminal', 'run_command', 'todo', 'eval', 'hub', 'lsp', 'github', 'task', 'resolve', 'reject'].includes(titlePrefix)) {
    return titlePrefix;
  }

  return rawType;
}

/** Panel khusus per tool family — dirender di dalam body ToolCallCard. */
export function ToolDetailsPanel({ tool }: { tool: ToolCallData }): ReactNode {
  const key = resolveToolKey(tool);

  // File Read Family
  if (key === 'read' || key === 'read_file' || key === 'view_file' || key === 'read_file_content') {
    const targetFile = resolveTargetFile(tool);
    return <Read tool={tool} targetFilePath={targetFile} output={tool.output || ''} />;
  }

  // File Edit / Write Family
  if (
    key === 'edit' ||
    key === 'write' ||
    key === 'edit_file' ||
    key === 'create_file' ||
    key === 'write_to_file' ||
    key === 'replace_file_content' ||
    key === 'multi_edit_file'
  ) {
    return <Edit tool={tool} />;
  }

  // Task & Todo
  if (key === 'task') return <TaskResult tool={tool} />;
  if (key === 'todo') return <Todo tool={tool} />;

  // Search & Navigation
  if (key === 'grep' || key === 'glob' || key === 'ast_grep') return <SearchTool tool={tool} />;
  if (key === 'search_fs') return <SearchFs tool={tool} />;
  if (key === 'web_search') return <WebSearch tool={tool} />;

  // Code & Terminal Execution
  if (key === 'bash' || key === 'terminal' || key === 'run_command') return <Bash tool={tool} />;
  if (key === 'eval') return <Eval tool={tool} />;
  if (key === 'lsp') return <Lsp tool={tool} />;
  if (key === 'ast_edit') return <AstEdit tool={tool} />;
  if (key === 'resolve' || key === 'reject') return <Resolve tool={tool} />;

  // System, Process & Management
  if (key === 'hub') return <Hub tool={tool} />;
  if (key === 'github') return <Github tool={tool} />;
  if (key === 'checkpoint' || key === 'rewind') return <Checkpoint tool={tool} />;
  if (key === 'security_scan') return <SecurityScan tool={tool} />;
  if (key === 'debug') return <Debug tool={tool} />;
  if (key === 'manage_skill') return <ManageSkill tool={tool} />;

  // Agent State & Interaction
  if (key === 'context_notes' || key === 'new_context') return <ContextNotes tool={tool} />;
  if (key === 'memory_edit' || key === 'retain' || key === 'recall' || key === 'reflect' || key === 'learn') {
    return <Memory tool={tool} />;
  }
  if (key === 'goal' || key === 'yield') return <Goal tool={tool} />;
  if (key === 'ask') return <Ask tool={tool} />;
  if (key === 'think') return <Think tool={tool} />;

  return null;
}

/** True kalau tool punya panel khusus yang sudah merender input/output sendiri —
 *  ToolCallCard tidak boleh render Input/Output generik lagi (anti dobel). */
export function hasToolDetailsPanel(tool: ToolCallData): boolean {
  return ToolDetailsPanel({ tool }) !== null;
}
