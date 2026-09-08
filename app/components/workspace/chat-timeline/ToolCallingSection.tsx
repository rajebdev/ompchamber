import { useState, useMemo } from 'react';
import type { ToolCallData, AgentActionData, ToolType } from '@/types';
import { ToolCallCard } from '@/components/workspace/chat-timeline/ToolCallCard';

interface ToolCallingSectionProps {
  tools: (ToolCallData | AgentActionData)[];
  title?: string;
  defaultExpanded?: boolean;
}

// Convert legacy AgentActionData to ToolCallData with a stable ID
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

export function ToolCallingSection({
  tools
}: ToolCallingSectionProps) {
  // Memoize normalized tools to maintain stable IDs across renders
  const normalizedTools = useMemo(() => {
    return (tools || []).map((t, i) => normalizeToolData(t, i));
  }, [tools]);

  // Keep a map of open/closed status for each tool
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    normalizedTools.forEach((tool) => {
      // Default: only errors are expanded. Long successful outputs (agent
      // reports, file reads) stay collapsed so a single card never owns a
      // second scrollbar beside the timeline one.
      initial[tool.id] = tool.status === 'error';
    });
    return initial;
  });

  if (!normalizedTools || normalizedTools.length === 0) return null;

  const toggleTool = (toolId: string) => {
    setOpenMap(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  };

  return (
    <div className="w-full font-sans space-y-1.5">
      {normalizedTools.map((tool) => (
        <ToolCallCard
          key={tool.id}
          tool={tool}
          isOpen={Boolean(openMap[tool.id])}
          onToggle={() => toggleTool(tool.id)}
        />
      ))}
    </div>
  );
}
