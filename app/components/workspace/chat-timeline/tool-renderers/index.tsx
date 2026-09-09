import type { ReactNode } from 'react';
import type { ToolCallData } from '@/types';
import { TaskResultPanel } from '@/components/workspace/chat-timeline/tool-renderers/TaskResultPanel';
import { TodoPanel } from '@/components/workspace/chat-timeline/tool-renderers/TodoPanel';
import { LspPanel } from '@/components/workspace/chat-timeline/tool-renderers/LspPanel';
import { WebSearchPanel } from '@/components/workspace/chat-timeline/tool-renderers/WebSearchPanel';
import { EvalPanel } from '@/components/workspace/chat-timeline/tool-renderers/EvalPanel';
import { GithubPanel } from '@/components/workspace/chat-timeline/tool-renderers/GithubPanel';
import { CheckpointPanel } from '@/components/workspace/chat-timeline/tool-renderers/CheckpointPanel';
import { BashPanel } from '@/components/workspace/chat-timeline/tool-renderers/BashPanel';
import { SearchPanel } from '@/components/workspace/chat-timeline/tool-renderers/SearchPanel';
import { SecurityScanPanel } from '@/components/workspace/chat-timeline/tool-renderers/SecurityScanPanel';
import { HubPanel } from '@/components/workspace/chat-timeline/tool-renderers/HubPanel';
import { ContextNotesPanel } from '@/components/workspace/chat-timeline/tool-renderers/ContextNotesPanel';
import { MemoryPanel } from '@/components/workspace/chat-timeline/tool-renderers/MemoryPanel';
import { DebugPanel } from '@/components/workspace/chat-timeline/tool-renderers/DebugPanel';
import { GoalPanel } from '@/components/workspace/chat-timeline/tool-renderers/GoalPanel';
import { AstEditPanel } from '@/components/workspace/chat-timeline/tool-renderers/AstEditPanel';
import { ManageSkillPanel } from '@/components/workspace/chat-timeline/tool-renderers/ManageSkillPanel';
import { SearchFsPanel } from '@/components/workspace/chat-timeline/tool-renderers/SearchFsPanel';
import { AskPanel } from '@/components/workspace/chat-timeline/tool-renderers/AskPanel';
import { ThinkPanel } from '@/components/workspace/chat-timeline/tool-renderers/ThinkPanel';
import { ReadPanel } from '@/components/workspace/chat-timeline/tool-renderers/ReadPanel';
import { EditPanel } from '@/components/workspace/chat-timeline/tool-renderers/EditPanel';

function resolveTargetFile(tool: ToolCallData): string | undefined {
  if (tool.target) return tool.target;
  if (tool.diff?.file) return tool.diff.file;
  if (tool.input && typeof tool.input === 'object' && typeof (tool.input as any).path === 'string') {
    return (tool.input as any).path;
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
  const rawName = (tool.name || '').toLowerCase();
  const rawType = (tool.type || '').toLowerCase();
  const rawTitle = (tool.title || '').toLowerCase();

  // If specific tool name is given (e.g. 'todo', 'eval', 'hub', 'grep', 'glob', 'read', 'write', 'edit')
  if (rawName && rawName !== 'tool' && rawName !== 'custom') {
    return rawName;
  }

  // Check title prefix if e.g. "grep — .", "read — app/...", "write — app/..."
  const titlePrefix = rawTitle.split(/[\s—\-:]+/)[0]?.trim();
  if (['grep', 'glob', 'read', 'write', 'edit', 'bash', 'terminal', 'todo', 'eval', 'hub', 'lsp', 'github', 'task'].includes(titlePrefix)) {
    return titlePrefix;
  }

  return rawType;
}

/** Panel khusus per tool family — dirender di dalam body ToolCallCard. */
export function ToolDetailsPanel({ tool }: { tool: ToolCallData }): ReactNode {
  const key = resolveToolKey(tool);

  // File Read Family
  if (key === 'read' || key === 'read_file' || key === 'view_file') {
    const targetFile = resolveTargetFile(tool);
    return <ReadPanel targetFilePath={targetFile} output={tool.output || ''} />;
  }

  // File Edit / Write Family
  if (key === 'edit' || key === 'write' || key === 'edit_file' || key === 'create_file') {
    return <EditPanel tool={tool} />;
  }

  // Task & Todo
  if (key === 'task') return <TaskResultPanel tool={tool} />;
  if (key === 'todo') return <TodoPanel tool={tool} />;

  // Search & Navigation
  if (key === 'grep' || key === 'glob' || key === 'ast_grep') return <SearchPanel tool={tool} />;
  if (key === 'search_fs') return <SearchFsPanel tool={tool} />;
  if (key === 'web_search') return <WebSearchPanel tool={tool} />;

  // Code & Terminal Execution
  if (key === 'bash' || key === 'terminal') return <BashPanel tool={tool} />;
  if (key === 'eval') return <EvalPanel tool={tool} />;
  if (key === 'lsp') return <LspPanel tool={tool} />;
  if (key === 'ast_edit') return <AstEditPanel tool={tool} />;

  // System, Process & Management
  if (key === 'hub') return <HubPanel tool={tool} />;
  if (key === 'github') return <GithubPanel tool={tool} />;
  if (key === 'checkpoint' || key === 'rewind') return <CheckpointPanel tool={tool} />;
  if (key === 'security_scan') return <SecurityScanPanel tool={tool} />;
  if (key === 'debug') return <DebugPanel tool={tool} />;
  if (key === 'manage_skill') return <ManageSkillPanel tool={tool} />;

  // Agent State & Interaction
  if (key === 'context_notes' || key === 'new_context') return <ContextNotesPanel tool={tool} />;
  if (key === 'memory_edit' || key === 'retain' || key === 'recall' || key === 'reflect' || key === 'learn') {
    return <MemoryPanel tool={tool} />;
  }
  if (key === 'goal' || key === 'yield') return <GoalPanel tool={tool} />;
  if (key === 'ask') return <AskPanel tool={tool} />;
  if (key === 'think') return <ThinkPanel tool={tool} />;

  return null;
}

/** True kalau tool punya panel khusus yang sudah merender input/output sendiri —
 *  ToolCallCard tidak boleh render Input/Output generik lagi (anti dobel). */
export function hasToolDetailsPanel(tool: ToolCallData): boolean {
  return ToolDetailsPanel({ tool }) !== null;
}
