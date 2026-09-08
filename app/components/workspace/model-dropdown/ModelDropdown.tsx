import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { AIModelOption } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { INITIAL_MODELS_CATALOG } from '@/data/modelCatalogData';
import { fetchModelsData, subscribeModelsUpdated } from '@/lib/models-client';
import { ModelDropdownHeader } from '@/components/workspace/model-dropdown/ModelDropdownHeader';
import { ModelDropdownSection } from '@/components/workspace/model-dropdown/ModelDropdownSection';
import { ModelDropdownFooter } from '@/components/workspace/model-dropdown/ModelDropdownFooter';
import { ModelSpecsTooltip } from '@/components/workspace/model-dropdown/ModelSpecsTooltip';

interface ModelDropdownProps {
  selectedModel?: AIModelOption;
  onSelectModel?: (model: AIModelOption) => void;
  onOpenAddProvider?: () => void;
  onThinkingLevelChange?: (level: string) => void;
  className?: string;
}

export function ModelDropdown({
  selectedModel: externalSelectedModel,
  onSelectModel,
  onOpenAddProvider,
  onThinkingLevelChange,
  className = '',
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<AIModelOption[]>(INITIAL_MODELS_CATALOG);
  const [selectedModel, setSelectedModel] = useState<AIModelOption>(
    externalSelectedModel || INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0]
  );
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [hoveredModel, setHoveredModel] = useState<AIModelOption | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => {
    setIsOpen(false);
    setHoveredModel(null);
    setFocusedIndex(-1);
  });

  // Read the latest external selection without re-triggering the models fetch.
  // Re-fetching on every thinking change would reset the pill to its default.
  const externalSelectedRef = useRef(externalSelectedModel);
  externalSelectedRef.current = externalSelectedModel;

  const loadModelsFromApi = useCallback(async () => {
    try {
      const data = await fetchModelsData();
      if (Array.isArray(data.modelList) && data.modelList.length > 0) {
          const realModels: AIModelOption[] = data.modelList.map((m: { id: string; name: string; provider: string; contextWindow?: number; thinkingLevels?: string[]; cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } }) => {
            const ladder = Array.isArray(m.thinkingLevels) ? m.thinkingLevels : [];
            return {
              id: m.id,
              name: m.name,
              provider: m.provider,
              contextWindow: m.contextWindow,
              thinkingLevel: ladder[0] ?? 'off',
              thinkingLevels: ladder,
              capabilities: ladder.length > 1 ? ['Tool calling', 'Reasoning'] : ['Tool calling'],
              cost: m.cost ? {
                input: m.cost.input !== undefined ? `$${m.cost.input}` : '—',
                output: m.cost.output !== undefined ? `$${m.cost.output}` : '—',
                cacheRead: m.cost.cacheRead !== undefined ? `$${m.cost.cacheRead}` : undefined,
                cacheWrite: m.cost.cacheWrite !== undefined ? `$${m.cost.cacheWrite}` : undefined,
              } : undefined,
            };
          });
          // Keep a thinking level the user already picked, but only when it is
          // still a real level of this model's ladder (legacy mock values like
          // 'Default'/'High' must not be preserved).
          setModels(prev => realModels.map(rm => {
            const existing = prev.find(p => p.id === rm.id && p.provider === rm.provider);
            return existing?.thinkingLevel && rm.thinkingLevels?.includes(existing.thinkingLevel)
              ? { ...rm, thinkingLevel: existing.thinkingLevel }
              : rm;
          }));
          const defaultModel = data.defaultModel;
          if (defaultModel && !externalSelectedRef.current) {
            const match = realModels.find(m => m.id === defaultModel.modelId && m.provider === defaultModel.provider);
            if (match) setSelectedModel(match);
          }
        } else if (Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        }
        if (data.selectedModel && !externalSelectedRef.current) {
          setSelectedModel(data.selectedModel);
        }
    } catch {}
  }, []);

  useEffect(() => {
    loadModelsFromApi();
    return subscribeModelsUpdated(loadModelsFromApi);
  }, [loadModelsFromApi]);

  useEffect(() => {
    if (!externalSelectedModel) return;
    setSelectedModel(externalSelectedModel);
    // The pill in each row reads `models[i].thinkingLevel`, so a thinking
    // change made in the composer (which flows back via this prop) must also
    // update the matching list entry — not just the selectedModel state.
    setModels(prev => prev.map(m =>
      m.id === externalSelectedModel.id && m.provider === externalSelectedModel.provider
        ? { ...m, thinkingLevel: externalSelectedModel.thinkingLevel }
        : m
    ));
  }, [externalSelectedModel]);

  const handleAddProviderClick = () => {
    setIsOpen(false);
    setHoveredModel(null);
    if (onOpenAddProvider) {
      onOpenAddProvider();
    } else {
      window.dispatchEvent(
        new CustomEvent('omp:open-settings', {
          detail: { category: 'providers', autoOpenAdd: true },
        })
      );
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(m => 
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      String(m.contextWindow ?? '').toLowerCase().includes(q) ||
      m.capabilities?.some(c => c.toLowerCase().includes(q))
    );
  }, [models, search]);

  const favoriteModels = useMemo(() => filteredModels.filter(m => m.isFavorite), [filteredModels]);
  const recentModels = useMemo(() => filteredModels.filter(m => m.isRecent && !m.isFavorite), [filteredModels]);

  const providerGroups = useMemo(() => {
    const groups: Record<string, AIModelOption[]> = {};
    filteredModels.forEach(m => {
      const provider = m.provider.toUpperCase();
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(m);
    });
    return groups;
  }, [filteredModels]);

  const visibleFlatList = useMemo(() => {
    const list: AIModelOption[] = [];
    if (!collapsedSections['favorites']) list.push(...favoriteModels);
    if (!collapsedSections['recent']) list.push(...recentModels);
    Object.entries(providerGroups).forEach(([provider, groupModels]) => {
      if (!collapsedSections[provider]) list.push(...groupModels);
    });
    return list;
  }, [collapsedSections, favoriteModels, recentModels, providerGroups]);

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModels(prev => prev.map(m => m.id === id ? { ...m, isFavorite: !m.isFavorite } : m));
    try {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'toggleFavorite', modelId: id }),
      });
    } catch {}
  };

  const cycleThinkingLevel = (id: string) => {
    const currentModel = models.find(m => m.id === id);
    const ladder = currentModel?.thinkingLevels ?? [];
    if (ladder.length === 0) return;
    const current = currentModel?.thinkingLevel ?? ladder[0];
    const idx = ladder.indexOf(current);
    const nextThinking = ladder[(idx + 1) % ladder.length];

    setModels(prev => prev.map(m => m.id === id ? { ...m, thinkingLevel: nextThinking } : m));
    if (selectedModel.id === id) {
      setSelectedModel(prev => ({ ...prev, thinkingLevel: nextThinking }));
      onSelectModel?.({ ...selectedModel, thinkingLevel: nextThinking });
    }
    onThinkingLevelChange?.(nextThinking);
  };

  const toggleAgentCmd = async (id: string) => {
    const target = models.find(m => m.id === id);
    const nextCmd = !target?.isCmdAgent;

    setModels(prev => prev.map(m => m.id === id ? { ...m, isCmdAgent: nextCmd } : m));
    if (selectedModel.id === id) {
      setSelectedModel(prev => ({ ...prev, isCmdAgent: nextCmd }));
    }
    try {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'toggleCmd', modelId: id }),
      });
    } catch {}
  };

  const handleSelect = async (model: AIModelOption) => {
    setSelectedModel(model);
    onSelectModel?.(model);
    setIsOpen(false);
    setHoveredModel(null);
    try {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'selectModel', model }),
      });
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = (prev + 1) % Math.max(1, visibleFlatList.length);
        setHoveredModel(visibleFlatList[next] || null);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const prevIdx = (prev - 1 + visibleFlatList.length) % Math.max(1, visibleFlatList.length);
        setHoveredModel(visibleFlatList[prevIdx] || null);
        return prevIdx;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = (focusedIndex >= 0 ? visibleFlatList[focusedIndex] : null) || hoveredModel;
      if (target) handleSelect(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHoveredModel(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = (focusedIndex >= 0 ? visibleFlatList[focusedIndex] : null) || hoveredModel;
      if (target) toggleAgentCmd(target.id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const target = (focusedIndex >= 0 ? visibleFlatList[focusedIndex] : null) || hoveredModel;
      if (target) cycleThinkingLevel(target.id);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          setHoveredModel(null);
          setFocusedIndex(-1);
        }}
        className="flex items-center space-x-1.5 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80 font-medium cursor-pointer"
        title={`${selectedModel.provider} • ${selectedModel.name}`}
      >
        <span className="text-ink/60 flex-shrink-0">
          {selectedModel.isCmdAgent ? (
            <span className="font-mono text-[10px] font-bold text-ink/70">⌘</span>
          ) : selectedModel.provider.toLowerCase() === 'deepseek' ? (
            <span>🐋</span>
          ) : (
            <Sparkles size={12} className="text-ink/60" />
          )}
        </span>
        <span className="flex items-center space-x-1 truncate max-w-[280px]">
          <span className="text-ink/50 font-normal">{selectedModel.provider}</span>
          <span className="text-ink/30">•</span>
          <span className="truncate">{selectedModel.name}</span>
        </span>
        <ChevronDown size={12} className="text-ink/40 flex-shrink-0" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2.5 z-50 flex items-start">
          <div className="w-84 sm:w-96 bg-paper border border-ink/20 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs max-h-[460px] animate-in fade-in zoom-in-95 duration-100">
            <ModelDropdownHeader
              search={search}
              onSearchChange={setSearch}
              onAddProvider={handleAddProviderClick}
            />

            {/* Scrollable Model Lists */}
            <div 
              className="flex-1 overflow-y-auto p-1.5 space-y-2 max-h-80"
              onMouseLeave={() => setHoveredModel(null)}
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
                    onToggleCollapse={toggleSection}
                    selectedModelId={selectedModel.id}
                    visibleFlatList={visibleFlatList}
                    focusedIndex={focusedIndex}
                    onSelect={handleSelect}
                    onToggleFavorite={handleToggleFavorite}
                    onCycleThinking={cycleThinkingLevel}
                    onHoverItem={(idx, m) => {
                      setFocusedIndex(idx);
                      setHoveredModel(m);
                    }}
                  />

                  <ModelDropdownSection
                    id="recent"
                    title="RECENT"
                    iconType="recent"
                    models={recentModels}
                    isCollapsed={!!collapsedSections['recent']}
                    onToggleCollapse={toggleSection}
                    selectedModelId={selectedModel.id}
                    visibleFlatList={visibleFlatList}
                    focusedIndex={focusedIndex}
                    onSelect={handleSelect}
                    onToggleFavorite={handleToggleFavorite}
                    onCycleThinking={cycleThinkingLevel}
                    onHoverItem={(idx, m) => {
                      setFocusedIndex(idx);
                      setHoveredModel(m);
                    }}
                  />

                  {Object.entries(providerGroups).map(([provider, pModels]) => (
                    <ModelDropdownSection
                      key={provider}
                      id={provider}
                      title={provider}
                      iconType={provider === 'DEEPSEEK' ? 'whale' : 'provider'}
                      models={pModels}
                      isCollapsed={!!collapsedSections[provider]}
                      onToggleCollapse={toggleSection}
                      selectedModelId={selectedModel.id}
                      visibleFlatList={visibleFlatList}
                      focusedIndex={focusedIndex}
                      onSelect={handleSelect}
                      onToggleFavorite={handleToggleFavorite}
                      onCycleThinking={cycleThinkingLevel}
                      onHoverItem={(idx, m) => {
                        setFocusedIndex(idx);
                        setHoveredModel(m);
                      }}
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
      )}
    </div>
  );
}
