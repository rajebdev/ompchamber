import React, { useState } from 'react';
import { X, Settings2, Check } from 'lucide-react';
import type { ProviderModel } from '@/types';

interface ModelConfigModalProps {
  isOpen: boolean;
  model: ProviderModel | null;
  onClose: () => void;
  onSaveModelConfig: (modelId: string, updates: Partial<ProviderModel>) => void;
}

export function ModelConfigModal({
  isOpen,
  model,
  onClose,
  onSaveModelConfig,
}: ModelConfigModalProps) {
  if (!isOpen || !model) return null;

  const [temperature, setTemperature] = useState<number>(model.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState<number>(model.maxTokens ?? 384000);
  const [topP, setTopP] = useState<number>(model.topP ?? 0.95);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(
    model.reasoningEffort ?? 'medium'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveModelConfig(model.id, {
      temperature,
      maxTokens,
      topP,
      reasoningEffort,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-ink/15 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-ink/70" />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Model Configuration
              </h3>
              <p className="text-[11px] text-ink/50 truncate max-w-[280px]">
                {model.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Temperature Slider */}
          <div>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-ink">Sampling Temperature</span>
              <span className="font-mono text-ink/70 font-semibold">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-ink cursor-pointer"
            />
            <p className="text-[10px] text-ink/40 mt-0.5">
              Controls randomness: lower is more deterministic, higher is more creative.
            </p>
          </div>

          {/* Top P Slider */}
          <div>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-ink">Top P (Nucleus Sampling)</span>
              <span className="font-mono text-ink/70 font-semibold">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full accent-ink cursor-pointer"
            />
          </div>

          {/* Max Output Tokens */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Max Output Tokens
            </label>
            <input
              type="number"
              min={1024}
              max={1000000}
              step={1024}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
              className="w-full bg-paper border border-ink/20 rounded-md px-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
            />
          </div>

          {/* Reasoning Effort (if supported) */}
          {model.hasReasoning && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Reasoning Effort
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setReasoningEffort(lvl)}
                    className={`py-1.5 rounded-md text-xs font-medium border text-center transition-colors cursor-pointer capitalize ${
                      reasoningEffort === lvl
                        ? 'border-ink/50 bg-ink/10 text-ink'
                        : 'border-ink/15 text-ink/60 hover:border-ink/30'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-ink/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-ink/20 text-xs font-medium text-ink hover:bg-ink/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md bg-ink text-canvas text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>Save Parameters</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
