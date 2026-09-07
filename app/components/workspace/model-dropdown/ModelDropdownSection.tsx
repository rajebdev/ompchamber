import React from 'react';
import { ChevronDown, ChevronUp, Star, History, GripVertical } from 'lucide-react';
import type { AIModelOption } from '@/types';
import { ModelDropdownItem } from './ModelDropdownItem';

interface ModelDropdownSectionProps {
  id: string;
  title: string;
  iconType?: 'star' | 'recent' | 'provider' | 'whale';
  models: AIModelOption[];
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  selectedModelId: string;
  visibleFlatList: AIModelOption[];
  focusedIndex: number;
  onSelect: (model: AIModelOption) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onCycleThinking: (id: string, e: React.MouseEvent) => void;
  onHoverItem: (index: number, model: AIModelOption) => void;
}

export function ModelDropdownSection({
  id,
  title,
  iconType = 'provider',
  models,
  isCollapsed,
  onToggleCollapse,
  selectedModelId,
  visibleFlatList,
  focusedIndex,
  onSelect,
  onToggleFavorite,
  onCycleThinking,
  onHoverItem,
}: ModelDropdownSectionProps) {
  if (models.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onToggleCollapse(id)}
        className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-ink/60 uppercase tracking-wider hover:text-ink cursor-pointer select-none"
      >
        <div className="flex items-center space-x-1.5">
          {iconType === 'star' && <Star size={12} className="fill-sky-400 text-sky-400" />}
          {iconType === 'recent' && <History size={12} className="text-ink/60" />}
          {iconType === 'whale' && <span>🐋</span>}
          {iconType === 'provider' && <GripVertical size={11} className="text-ink/25" />}
          <span>{title}</span>
        </div>
        {isCollapsed ? (
          <ChevronDown size={12} className="text-ink/40" />
        ) : (
          <ChevronUp size={12} className="text-ink/40" />
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-0.5">
          {models.map((m) => {
            const index = visibleFlatList.findIndex(item => item.id === m.id);
            return (
              <ModelDropdownItem
                key={`${id}-${m.id}`}
                model={m}
                isSelected={selectedModelId === m.id}
                isFocused={focusedIndex === index}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onCycleThinking={onCycleThinking}
                onMouseEnter={() => onHoverItem(index, m)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
