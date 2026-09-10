import type { MouseEvent } from 'react';
import type { AIModelOption } from '@/types';
import { ModelDropdownHeader } from '@/components/workspace/model-dropdown/Header';
import { ModelDropdownSection } from '@/components/workspace/model-dropdown/Section';
import { ModelDropdownFooter } from '@/components/workspace/model-dropdown/Footer';
import { ModelSpecsTooltip } from '@/components/workspace/model-dropdown/SpecsTooltip';

interface ModelDropdownPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAddProvider: () => void;
  filteredModels: AIModelOption[];
  favoriteModels: AIModelOption[];
  recentModels: AIModelOption[];
  providerGroups: Record<string, AIModelOption[]>;
  collapsedSections: Record<string, boolean>;
  onToggleCollapse: (section: string) => void;
  selectedModelId: string;
  visibleFlatList: AIModelOption[];
  focusedIndex: number;
  hoveredModel: AIModelOption | null;
  onSelect: (model: AIModelOption) => void;
  onToggleFavorite: (id: string, e: MouseEvent) => void;
  onCycleThinking: (id: string) => void;
  onHoverItem: (index: number, model: AIModelOption) => void;
  onMouseLeave: () => void;
}

export function ModelDropdownPanel({
  search,
  onSearchChange,
  onAddProvider,
  filteredModels,
  favoriteModels,
  recentModels,
  providerGroups,
  collapsedSections,
  onToggleCollapse,
  selectedModelId,
  visibleFlatList,
  focusedIndex,
  hoveredModel,
  onSelect,
  onToggleFavorite,
  onCycleThinking,
  onHoverItem,
  onMouseLeave,
}: ModelDropdownPanelProps) {
  return (
    <div className="absolute bottom-full left-0 mb-2.5 z-50 flex items-start">
      <div className="w-84 sm:w-96 bg-paper border border-ink/20 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs max-h-[460px] animate-in fade-in zoom-in-95 duration-100">
        <ModelDropdownHeader
          search={search}
          onSearchChange={onSearchChange}
          onAddProvider={onAddProvider}
        />

        {/* Scrollable Model Lists */}
        <div
          className="flex-1 scrollbar-overlay-container scrollbar-overlay-static p-1.5 space-y-2 max-h-80"
          onMouseLeave={onMouseLeave}
        >
          {filteredModels.length === 0 ? (
            <div className="px-3 py-6 text-center text-ink/40 italic">
              No models found matching &quot;{search}&quot;
            </div>
          ) : (
            <>
              <ModelDropdownSection
                id="favorites"
                title="FAVORITES"
                iconType="star"
                models={favoriteModels}
                isCollapsed={!!collapsedSections['favorites']}
                onToggleCollapse={onToggleCollapse}
                selectedModelId={selectedModelId}
                visibleFlatList={visibleFlatList}
                focusedIndex={focusedIndex}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onCycleThinking={onCycleThinking}
                onHoverItem={onHoverItem}
              />

              <ModelDropdownSection
                id="recent"
                title="RECENT"
                iconType="recent"
                models={recentModels}
                isCollapsed={!!collapsedSections['recent']}
                onToggleCollapse={onToggleCollapse}
                selectedModelId={selectedModelId}
                visibleFlatList={visibleFlatList}
                focusedIndex={focusedIndex}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onCycleThinking={onCycleThinking}
                onHoverItem={onHoverItem}
              />

              {Object.entries(providerGroups).map(([provider, pModels]) => (
                <ModelDropdownSection
                  key={provider}
                  id={provider}
                  title={provider}
                  iconType={provider === 'DEEPSEEK' ? 'whale' : 'provider'}
                  models={pModels}
                  isCollapsed={!!collapsedSections[provider]}
                  onToggleCollapse={onToggleCollapse}
                  selectedModelId={selectedModelId}
                  visibleFlatList={visibleFlatList}
                  focusedIndex={focusedIndex}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  onCycleThinking={onCycleThinking}
                  onHoverItem={onHoverItem}
                />
              ))}
            </>
          )}
        </div>

        <ModelDropdownFooter />
      </div>

      {/* Floating Specs Card: only visible when hovering or keyboard navigating */}
      {hoveredModel && (
        <div className="hidden lg:block ml-2 self-center">
          <ModelSpecsTooltip model={hoveredModel} />
        </div>
      )}
    </div>
  );
}
