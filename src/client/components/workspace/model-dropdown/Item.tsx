import type { TargetedMouseEvent } from 'preact';
import { Brain, Check, Command, GripVertical, Star } from 'lucide-preact';
import type { AIModelOption } from '@/shared/types';
import { formatContextWindow } from '@/shared/lib/code/format';
import { ProviderIcon } from '@/client/components/common/provider-icon';

interface ModelDropdownItemProps {
  model: AIModelOption;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (model: AIModelOption) => void;
  onToggleFavorite: (model: AIModelOption, e: TargetedMouseEvent<HTMLElement>) => void;
  onCycleThinking?: (model: AIModelOption, e: TargetedMouseEvent<HTMLElement>) => void;
  onMouseEnter: () => void;
}

export function ModelDropdownItem({
  model,
  isSelected,
  isFocused,
  onSelect,
  onToggleFavorite,
  onCycleThinking,
  onMouseEnter,
}: ModelDropdownItemProps) {
  // Provider / Agent icon renderer
  const renderIcon = () => {
    if (model.isCmdAgent) {
      return (
        <span 
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-ink/20 bg-ink/5 text-ink/80 flex-shrink-0"
          title="Autonomous Agent Command Mode [CMD]"
        >
          <Command size={10} />
        </span>
      );
    }

    // The provider's own mark, keyed on the catalog's `providerIcon` first so a
    // legacy key still resolves; unknown providers fall back to their initials.
    return (
      <ProviderIcon
        icon={model.providerIcon}
        slug={model.provider}
        name={model.provider}
        size={13}
        className="text-ink/70"
      />
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(model)}
      onMouseEnter={onMouseEnter}
      className={`group relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer select-none ${
        isFocused 
          ? 'bg-ink/10 text-ink' 
          : isSelected 
            ? 'bg-ink/5 text-ink' 
            : 'text-ink/85 hover:bg-ink/5'
      }`}
    >
      {/* Left: Drag Handle, Icon, Title, Context */}
      <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
        <GripVertical 
          size={12} 
          className="text-ink/20 group-hover:text-ink/50 transition-colors flex-shrink-0" 
        />
        
        {renderIcon()}

        <div className="flex items-center space-x-1.5 truncate">
          {model.isCmdAgent && (
            <span className="font-mono text-[11px] font-semibold text-ink/75 flex-shrink-0">
              [CMD]
            </span>
          )}
          <span className={`truncate ${isSelected ? 'font-semibold text-ink' : 'font-normal text-ink/90'}`}>
            {model.name}
          </span>
          {model.contextWindow && (
            <span className="font-mono text-[10px] text-ink/45 flex-shrink-0">
              {formatContextWindow(model.contextWindow)}
            </span>
          )}
        </div>
      </div>

      {/* Right: Thinking pill, Checkmark, Star */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {model.thinkingLevel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCycleThinking?.(model, e);
            }}
            title={`Thinking preset: ${model.thinkingLevel} (Click or use ← / → to change)`}
            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-ink/70 bg-ink/5 hover:bg-ink/10 border border-ink/10 transition-colors cursor-pointer"
          >
            <Brain size={10} className="text-ink/50" />
            <span>{model.thinkingLevel}</span>
          </button>
        )}

        {isSelected && (
          <Check size={13} className="text-ink flex-shrink-0" />
        )}

        <button
          type="button"
          onClick={(e) => onToggleFavorite(model, e)}
          title={model.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className="p-1 rounded text-ink/30 hover:text-sky-400 hover:bg-ink/5 transition-colors cursor-pointer"
        >
          <Star 
            size={13} 
            className={model.isFavorite ? 'fill-sky-400 text-sky-400' : 'text-ink/30 hover:text-sky-400'} 
          />
        </button>
      </div>
    </div>
  );
}
