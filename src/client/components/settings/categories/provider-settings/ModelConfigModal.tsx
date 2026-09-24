import { useState } from 'preact/hooks';
import type { FormEvent } from 'preact/compat';
import { Check, Settings2 } from 'lucide-preact';
import type { ProviderModel } from '@/shared/types';
import { Modal } from '@/client/components/common/Modal';

interface ModelConfigModalProps {
  isOpen: boolean;
  model: ProviderModel | null;
  onClose: () => void;
  onSaveModelConfig: (modelId: string, updates: Partial<ProviderModel>) => void;
}

/** The reasoning levels omp's `thinking.efforts` accepts, in its own order. */
const EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * Per-model configuration for one entry of `models.yml`.
 *
 * Only the knobs omp resolves per MODEL live here: `maxTokens` and the
 * reasoning `thinking` block. omp has no per-model temperature or top-P — those
 * are global `config.yml` settings, editable in Settings → OMP Engine — so
 * offering sliders for them here would be a control that changes nothing. The
 * dialog points at that panel instead.
 */
export function ModelConfigModal({
  isOpen,
  model,
  onClose,
  onSaveModelConfig,
}: ModelConfigModalProps) {
  const [maxTokens, setMaxTokens] = useState<string>(
    model?.maxTokens ? String(model.maxTokens) : '',
  );
  const [reasoningEffort, setReasoningEffort] = useState<EffortLevel | ''>(
    (model?.reasoningEffort as EffortLevel | undefined) ?? '',
  );

  if (!isOpen || !model) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(maxTokens, 10);
    onSaveModelConfig(model.id, {
      // Empty clears the override, so the model returns to the catalog value.
      maxTokens: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      reasoningEffort: reasoningEffort || undefined,
    });
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      header={
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
      }
      form={{ onSubmit: handleSubmit, className: 'p-5 space-y-4' }}
      footer={
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
      }
    >
      {/* Max Output Tokens */}
      <div>
        <label className="block text-xs font-semibold text-ink mb-1">
          Max Output Tokens
        </label>
        <input
          type="number"
          min={1}
          step={1024}
          value={maxTokens}
          placeholder="Catalog default"
          onChange={(e) => setMaxTokens(e.currentTarget.value)}
          className="w-full bg-paper border border-ink/20 rounded-md px-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
        />
        <p className="text-[10px] text-ink/40 mt-0.5">
          Written to models.yml as this model's output cap. Empty uses the catalog value.
        </p>
      </div>

      {/* Reasoning Effort (only for models that support reasoning) */}
      {model.hasReasoning && (
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Default Reasoning Effort
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setReasoningEffort('')}
              className={`py-1.5 rounded-md text-xs font-medium border text-center transition-colors cursor-pointer ${
                reasoningEffort === ''
                  ? 'border-ink/50 bg-ink/10 text-ink'
                  : 'border-ink/15 text-ink/60 hover:border-ink/30'
              }`}
            >
              Auto
            </button>
            {EFFORT_LEVELS.map((lvl) => (
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
          <p className="text-[10px] text-ink/40 mt-0.5">
            The level omp starts this model at. Auto leaves the choice to the chat composer.
          </p>
        </div>
      )}

      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-ink/5 border border-ink/10 text-[11px] text-ink/60">
        <span>
          Sampling temperature and Top P are global omp settings, not per-model —
          change them in <span className="font-medium text-ink">Settings → OMP Engine</span>.
        </span>
      </div>
    </Modal>
  );
}
