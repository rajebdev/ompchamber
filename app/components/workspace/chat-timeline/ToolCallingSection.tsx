import React, { useState, useMemo } from 'react';
import { Wrench, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import type { ToolCallData, AgentActionData, ToolType } from '@/types';
import { ToolCallCard } from './ToolCallCard';

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
  tools,
  title,
  defaultExpanded = true
}: ToolCallingSectionProps) {
  const [isSectionOpen, setIsSectionOpen] = useState(defaultExpanded);

  // Memoize normalized tools to maintain stable IDs across renders
  const normalizedTools = useMemo(() => {
    return (tools || []).map((t, i) => normalizeToolData(t, i));
  }, [tools]);

  // Keep a map of open/closed status for each tool
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    normalizedTools.forEach((tool, idx) => {
      // Default: First item and errors are expanded
      initial[tool.id] = (idx === 0 || tool.status === 'error');
    });
    return initial;
  });

  if (!normalizedTools || normalizedTools.length === 0) return null;

  const errorCount = normalizedTools.filter(t => t.status === 'error').length;
  const toolCount = normalizedTools.length;

  const areAllExpanded = normalizedTools.every(t => Boolean(openMap[t.id]));

  const toggleTool = (toolId: string) => {
    setOpenMap(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  };

  const handleToggleExpandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !areAllExpanded;
    const nextMap: Record<string, boolean> = {};
    normalizedTools.forEach(t => {
      nextMap[t.id] = nextState;
    });
    setOpenMap(nextMap);
  };

  const handleToggleSection = () => {
    setIsSectionOpen(prev => !prev);
  };

  return (
    <div className="w-full my-2 font-sans border border-ink/15 rounded-lg bg-paper overflow-hidden transition-all duration-200">
      {/* Section Header Container (div container prevents nested button errors in HTML) */}
      <div className="w-full flex items-center justify-between px-3 py-2 bg-ink/5 border-b border-ink/10 text-[12px] select-none">
        {/* Left Side: Clickable Title & Icon to Toggle Section */}
        <button
          type="button"
          onClick={handleToggleSection}
          className="flex items-center space-x-2 min-w-0 pr-2 flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
          aria-expanded={isSectionOpen}
        >
          <div className="w-5 h-5 rounded flex items-center justify-center bg-ink/10 text-ink flex-shrink-0">
            <Wrench size={12} />
          </div>
          <span className="font-semibold text-ink tracking-tight text-[12px]">
            {title || `Tool Executions (${toolCount})`}
          </span>
          {errorCount > 0 && (
            <span className="text-[10px] font-mono text-error bg-error/10 border border-error/20 px-1.5 py-0.2 rounded font-medium flex-shrink-0">
              {errorCount} failed
            </span>
          )}
        </button>

        {/* Right Side: Action Controls */}
        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
          {isSectionOpen && toolCount > 1 && (
            <button
              type="button"
              onClick={handleToggleExpandAll}
              className="text-[10px] font-mono text-ink/60 hover:text-ink px-1.5 py-0.5 rounded hover:bg-ink/10 transition-colors flex items-center space-x-1 cursor-pointer"
              title={areAllExpanded ? 'Collapse all tool calls' : 'Expand all tool calls'}
            >
              <ChevronsUpDown size={11} />
              <span>{areAllExpanded ? 'Collapse All' : 'Expand All'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleSection}
            className="flex items-center space-x-1 text-ink/60 hover:text-ink cursor-pointer transition-colors p-0.5 rounded"
            aria-label={isSectionOpen ? 'Hide tools' : 'Show tools'}
          >
            <span className="text-[10px] font-mono hidden sm:inline">
              {isSectionOpen ? 'Hide' : 'Show'}
            </span>
            {isSectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* List of Tool Cards */}
      {isSectionOpen && (
        <div className="p-2 sm:p-2.5 space-y-2 bg-paper">
          {normalizedTools.map((tool) => (
            <ToolCallCard
              key={tool.id}
              tool={tool}
              isOpen={Boolean(openMap[tool.id])}
              onToggle={() => toggleTool(tool.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
