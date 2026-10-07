/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'preact/hooks';
import type { AgentActionData, ToolCallData, ToolType } from '@/shared/types';
import { ToolCallCard } from '@/client/components/workspace/chat-timeline/ToolCallCard';
import { useToolOpenState } from '@/client/hooks/chat/timeline/tool-open';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-preact';

interface ToolCallingSectionProps {
  tools: (ToolCallData | AgentActionData)[];
  title?: string;
  defaultExpanded?: boolean;
}

function normalizeToolData(action: ToolCallData | AgentActionData, index: number): ToolCallData {
  if ('id' in action && action.id) {
    return action as ToolCallData;
  }

  const rawTitle = action.title || '';
  const lowerTitle = rawTitle.toLowerCase();

  let type: ToolCallData['type'] = 'terminal';
  if (lowerTitle.includes('shell') || lowerTitle.includes('command') || lowerTitle.includes('bun') || lowerTitle.includes('git')) {
    type = 'bash';
  } else if (lowerTitle.includes('edit') || lowerTitle.includes('write')) {
    type = 'edit_file';
  } else if (lowerTitle.includes('read') || lowerTitle.includes('view') || lowerTitle.includes('cat') || lowerTitle.includes('inspect')) {
    type = 'read_file';
  } else if (lowerTitle.includes('search') || lowerTitle.includes('find') || lowerTitle.includes('grep')) {
    type = 'search_fs';
  }

  const cleanSlug = rawTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'tool';
  const finalType: ToolType = ('type' in action && action.type) ? action.type : type;

  return {
    id: `stable-tool-${index}-${cleanSlug}`,
    type: finalType,
    title: action.title,
    duration: action.time,
    time: action.time,
    detail: action.detail,
    target: ('target' in action && action.target) ? action.target : (finalType === 'read_file' || finalType === 'edit_file' || finalType === 'create_file' ? action.detail : undefined),
    command: action.command || (finalType === 'bash' ? action.detail : undefined),
    output: action.output,
    status: action.status || 'success',
    icon: action.icon,
    diff: 'diff' in action ? action.diff : undefined,
    input: 'input' in action ? action.input : undefined
  };
}

export function ToolCallingSection({ tools, title, defaultExpanded = false }: ToolCallingSectionProps) {
  const normalizedTools = useMemo(() => {
    return (tools || []).map((t, i) => normalizeToolData(t, i));
  }, [tools]);

  // Openness is remembered per session, so a reload or a history page-in does
  // not close the call the reader had opened.
  const { openMap, toggle, setAll, anyOpen } = useToolOpenState(normalizedTools, defaultExpanded);

  const expandAll = useCallback(() => setAll(true), [setAll]);
  const collapseAll = useCallback(() => setAll(false), [setAll]);

  if (!normalizedTools || normalizedTools.length === 0) return null;

  const showBulk = normalizedTools.length > 1;

  return (
    <div className="mx-3 space-y-1.5">
      {title && (
        <div className="flex items-center gap-2 px-1 pt-0.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/35">
            {title}
          </span>
          <span className="h-px flex-1 bg-ink/8" />
          {showBulk && (
            <button
              type="button"
              onClick={anyOpen ? collapseAll : expandAll}
              aria-label={anyOpen ? 'Collapse all tool calls' : 'Expand all tool calls'}
              title={anyOpen ? 'Collapse all' : 'Expand all'}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {anyOpen ? <ChevronsDownUp size={11} /> : <ChevronsUpDown size={11} />}
              <span>{anyOpen ? 'Collapse all' : 'Expand all'}</span>
            </button>
          )}
        </div>
      )}
      {normalizedTools.map((tool) => (
        <ToolCallCard
          key={tool.id}
          tool={tool}
          isOpen={Boolean(openMap[tool.id])}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
