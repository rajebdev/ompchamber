import type { TargetedMouseEvent } from 'preact';
import { ChevronDown, ChevronUp, History, Star } from 'lucide-preact';
import type { AIModelOption } from '@/shared/types';
import { ModelDropdownItem } from '@/client/components/workspace/model-dropdown/Item';
import { ProviderIcon } from '@/client/components/common/provider-icon';
import { modelKey } from '@/shared/lib/models/identity';

interface ModelDropdownSectionProps {
  id: string;
  title: string;
  iconType?: 'star' | 'recent' | 'provider';
  models: AIModelOption[];
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  /** Composite (`provider:id`) key of the active selection. */
  selectedModelKey: string;
  /** Composite key → index in the keyboard-navigation flat list. */
  modelIndex: Record<string, number>;
  focusedIndex: number;
  onSelect: (model: AIModelOption) => void;
  onToggleFavorite: (model: AIModelOption, e: TargetedMouseEvent<HTMLElement>) => void;
  onCycleThinking: (model: AIModelOption, e: TargetedMouseEvent<HTMLElement>) => void;
  onHoverItem: (index: number, model: AIModelOption) => void;
}

export function ModelDropdownSection({
  id,
  title,
  iconType = 'provider',
  models,
  isCollapsed,
  onToggleCollapse,
  selectedModelKey,
  modelIndex,
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
          {iconType === 'provider' && (
            // The section's own provider, taken from a row rather than the
            // uppercased group key, so the mark resolves off the real slug.
            <ProviderIcon
              icon={models[0]?.providerIcon}
              slug={models[0]?.provider ?? id}
              name={models[0]?.provider ?? id}
              size={12}
            />
          )}
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
            // Identity is provider + id: the same model id is served by several
            // providers, so an id-only match would focus/select their rows too.
            const key = modelKey(m);
            const index = modelIndex[key] ?? -1;
            return (
              <ModelDropdownItem
                key={`${id}-${key}`}
                model={m}
                isSelected={selectedModelKey === key}
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
