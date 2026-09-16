import { useState, useMemo, useCallback } from 'react';
import type { ToolCallData, AgentActionData, ToolType } from '@/types';
import { isSkippedTool } from '@/lib/chat/tool-status';
import { ToolCallCard } from '@/components/workspace/chat-timeline/ToolCallCard';

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
    diff: ('diff' in action ? (action as any).diff : undefined),
    input: ('input' in action ? (action as any).input : undefined)
  };
}

export function ToolCallingSection({ tools, title, defaultExpanded = false }: ToolCallingSectionProps) {
  const normalizedTools = useMemo(() => {
    return (tools || []).map((t, i) => normalizeToolData(t, i));
  }, [tools]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    normalizedTools.forEach((tool, idx) => {
      const isSkipped = isSkippedTool(tool);
      const isAutoOpen = !isSkipped && (tool.status === 'error' || (defaultExpanded && idx === 0));
      initial[tool.id] = isAutoOpen;
    });
    return initial;
  });

  // Stable identity so memoized ToolCallCard rows skip re-rendering while streaming.
  const toggleTool = useCallback((toolId: string) => {
    setOpenMap(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  }, []);

  if (!normalizedTools || normalizedTools.length === 0) return null;

  return (
    <div className="mx-3 space-y-1.5">
      {title && (
        <div className="flex items-center gap-2 px-1 pt-0.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/35">
            {title}
          </span>
          <span className="h-px flex-1 bg-ink/8" />
        </div>
      )}
      {normalizedTools.map((tool) => (
        <ToolCallCard
          key={tool.id}
          tool={tool}
          isOpen={Boolean(openMap[tool.id])}
          onToggle={toggleTool}
        />
      ))}
    </div>
  );
}
