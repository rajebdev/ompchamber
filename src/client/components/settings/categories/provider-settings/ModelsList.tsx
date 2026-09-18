import { useState } from 'preact/hooks';
import { Eye, EyeOff, Image as ImageIcon, RefreshCw, Search, Settings2, SlidersHorizontal } from 'lucide-preact';
import type { ProviderModel } from '@/shared/types';
import { formatContextWindow } from '@/shared/lib/code/format';

function formatPrice(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  return `$${value < 1 ? value.toFixed(2) : value.toFixed(2)}`;
}

interface ProviderModelsListProps {
  models: ProviderModel[];
  onToggleModelVisibility: (modelId: string) => void;
  onHideAll: () => void;
  onShowAll: () => void;
  onFetchModels: () => Promise<void>;
  canFetchModels: boolean;
  isFetchingModels: boolean;
  onOpenModelConfig: (model: ProviderModel) => void;
  onOpenModelCapabilities: (model: ProviderModel) => void;
}

export function ProviderModelsList({
  models,
  onToggleModelVisibility,
  onHideAll,
  onShowAll,
  onFetchModels,
  canFetchModels,
  isFetchingModels,
  onOpenModelConfig,
  onOpenModelCapabilities,
}: ProviderModelsListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3.5">
      {/* 1. Header with count & hide all / show all */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs font-semibold text-ink">
          Available Models <span className="font-normal text-ink/60">({models.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFetchModels}
            disabled={!canFetchModels || isFetchingModels}
            title={canFetchModels ? 'Fetch models from provider endpoint' : 'This provider has no fetchable endpoint'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-ink text-canvas text-[11px] font-medium hover:opacity-90 transition-opacity cursor-pointer border border-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={isFetchingModels ? 'animate-spin' : ''} />
            <span>{isFetchingModels ? 'fetching...' : 'fetch models'}</span>
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="px-2.5 py-1 rounded bg-ink/5 hover:bg-ink/10 text-[11px] font-medium text-ink/80 hover:text-ink transition-colors cursor-pointer border border-ink/10"
          >
            hide all
          </button>
          <button
            type="button"
            onClick={onShowAll}
            className="px-2.5 py-1 rounded bg-ink/5 hover:bg-ink/10 text-[11px] font-medium text-ink/80 hover:text-ink transition-colors cursor-pointer border border-ink/10"
          >
            show all
          </button>
        </div>
      </div>

      {/* 2. Filter Search Input */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-3 text-ink/40 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          placeholder="Filter models..."
          className="w-full bg-paper border border-ink/15 rounded-lg pl-9 pr-3 py-2 text-xs text-ink placeholder-ink/40 focus:outline-none focus:border-ink/40 transition-colors shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 text-[11px] text-ink/40 hover:text-ink cursor-pointer"
          >
            clear
          </button>
        )}
      </div>

      {/* 3. Model Rows */}
      <div className="space-y-1 pt-1">
        {filteredModels.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink/40">
            No models found matching "{searchQuery}"
          </div>
        ) : (
          filteredModels.map((model) => (
            <div
              key={model.id}
              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/5 transition-colors group ${
                !model.isVisible ? 'opacity-50' : ''
              }`}
            >
              {/* Left: Model Name */}
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-medium truncate block ${
                  model.isVisible ? 'text-ink' : 'text-ink/60 line-through decoration-ink/40'
                }`}>
                  {model.name}
                </span>
              </div>

              {/* Right: Price & Context Badge & Action Icons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Pricing Badge (per 1M tokens) */}
                {(model.priceInput !== undefined || model.priceOutput !== undefined) && (
                  <span
                    title={`$${model.priceInput ?? '?'} in / $${model.priceOutput ?? '?'} out per 1M tokens`}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink/5 text-ink/70 border border-ink/10"
                  >
                    {formatPrice(model.priceInput)} / {formatPrice(model.priceOutput)}
                  </span>
                )}

                {/* Context Window Badge */}
                {model.contextWindow && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink/5 text-ink/70 border border-ink/10">
                    {formatContextWindow(model.contextWindow)}
                  </span>
                )}

                {/* Tool Calling / Steering Button */}
                {model.hasTools && (
                  <button
                    type="button"
                    onClick={() => onOpenModelCapabilities(model)}
                    title="Tool Calling & Steering Capabilities"
                    className="p-1 rounded text-ink/50 hover:text-ink hover:bg-ink/10 transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal size={13} strokeWidth={1.8} />
                  </button>
                )}

                {/* Model Configuration (Gear) Button */}
                <button
                  type="button"
                  onClick={() => onOpenModelConfig(model)}
                  title="Configure Model Parameters"
                  className="p-1 rounded text-ink/50 hover:text-ink hover:bg-ink/10 transition-colors cursor-pointer"
                >
                  <Settings2 size={13} strokeWidth={1.8} />
                </button>

                {/* Vision Capability Icon */}
                {model.hasVision && (
                  <div
                    title="Multimodal / Vision inputs enabled"
                    className="p-1 text-ink/60"
                  >
                    <ImageIcon size={13} strokeWidth={1.8} />
                  </div>
                )}

                {/* Visibility Toggle (Eye) Button */}
                <button
                  type="button"
                  onClick={() => onToggleModelVisibility(model.id)}
                  title={model.isVisible ? 'Hide model from chat picker' : 'Show model in chat picker'}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    model.isVisible
                      ? 'text-ink/60 hover:text-ink hover:bg-ink/10'
                      : 'text-ink/30 hover:text-ink/70 hover:bg-ink/10'
                  }`}
                >
                  {model.isVisible ? (
                    <Eye size={14} strokeWidth={1.8} />
                  ) : (
                    <EyeOff size={14} strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
