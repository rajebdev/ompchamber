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

/** Panel khusus per tool family — dirender di dalam body ToolCallCard. */
export function ToolDetailsPanel({ tool }: { tool: ToolCallData }): ReactNode {
  const name = tool.type;
  if (name === 'task') return <TaskResultPanel tool={tool} />;
  if (name === 'todo') return <TodoPanel tool={tool} />;
  if (name === 'lsp') return <LspPanel tool={tool} />;
  if (name === 'web_search') return <WebSearchPanel tool={tool} />;
  if (name === 'eval') return <EvalPanel tool={tool} />;
  if (name === 'github') return <GithubPanel tool={tool} />;
  if (name === 'checkpoint' || name === 'rewind') return <CheckpointPanel tool={tool} />;
  if (name === 'bash' || name === 'terminal') return <BashPanel tool={tool} />;
  if (name === 'grep' || name === 'glob' || name === 'ast_grep') return <SearchPanel tool={tool} />;
  if (name === 'security_scan') return <SecurityScanPanel tool={tool} />;
  if (name === 'hub') return <HubPanel tool={tool} />;
  if (name === 'context_notes' || name === 'new_context') return <ContextNotesPanel tool={tool} />;
  if (name === 'memory_edit' || name === 'retain' || name === 'recall' || name === 'reflect' || name === 'learn') {
    return <MemoryPanel tool={tool} />;
  }
  if (name === 'debug') return <DebugPanel tool={tool} />;
  if (name === 'goal' || name === 'yield') return <GoalPanel tool={tool} />;
  if (name === 'ast_edit') return <AstEditPanel tool={tool} />;
  if (name === 'manage_skill') return <ManageSkillPanel tool={tool} />;
  if (name === 'search_fs') return <SearchFsPanel tool={tool} />;
  return null;
}

/** True kalau tool punya panel khusus yang sudah merender input/output sendiri —
 *  ToolCallCard tidak boleh render Input/Output generik lagi (anti dobel). */
export function hasToolDetailsPanel(tool: ToolCallData): boolean {
  return ToolDetailsPanel({ tool }) !== null;
}
