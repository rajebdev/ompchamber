import { useEffect, useState } from 'preact/hooks';
import { Check, DownloadCloud, Globe, Key, Layers, X } from 'lucide-preact';
import type { ProviderItem } from '@/shared/types';
import type { PresetProviderOption } from '@/shared/types/settings/provider';
import { fetchProviderModelsRemote } from '@/shared/lib/models/provider-models';
import { ProviderIcon } from '@/client/components/settings/categories/provider-settings/Icons';

interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProvider: (newProvider: ProviderItem, options: { fetchedCount: number }) => void;
  presets: PresetProviderOption[];
}

export function AddProviderModal({
  isOpen,
  onClose,
  onAddProvider,
  presets,
}: AddProviderModalProps) {
  const presetList = presets;
  const initialPreset = presetList[0];
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset?.id || 'openai');
  const [name, setName] = useState(initialPreset?.name || 'OpenAI');
  const [baseUrl, setBaseUrl] = useState(initialPreset?.defaultUrl || 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectPreset = (preset: PresetProviderOption) => {
    setSelectedPresetId(preset.id);
    setName(preset.name);
    setBaseUrl(preset.defaultUrl);
  };

  useEffect(() => {
    const selectedPreset = presetList.find((preset) => preset.id === selectedPresetId);
    if (!selectedPreset && presetList[0]) {
      handleSelectPreset(presetList[0]);
    }
  }, [presetList, selectedPresetId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!name.trim() || presetList.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const preset = presetList.find((p) => p.id === selectedPresetId);
      const timestamp = Date.now();
      const newProvider: ProviderItem = {
        id: `provider-${timestamp}`,
        name: name.trim(),
        slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-') || `provider-${timestamp}`,
        icon: preset?.icon || 'custom',
        status: 'connected',
        configuredIn: 'auth credentials',
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || 'sk-custom-••••••••••••••••••••••••',
        models: [],
      };

      const fetchResult = await fetchProviderModelsRemote(baseUrl.trim(), apiKey.trim() || undefined, newProvider.slug, true);
      if (fetchResult.ok && fetchResult.models) {
        newProvider.models = fetchResult.models;
        onAddProvider(newProvider, { fetchedCount: fetchResult.models.length });
      } else {
        onAddProvider(newProvider, { fetchedCount: -1 });
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
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
            <Layers size={16} className="text-ink/70" />
            <h3 className="text-sm font-semibold text-ink">Add Model Provider</h3>
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
          {/* Preset Picker */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Provider Preset
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-36 scrollbar-overlay-container scrollbar-overlay-static pr-1">
              {presetList.length === 0 && (
                <p className="col-span-2 px-2 py-3 text-xs text-ink/50">
                  All known provider types are already connected.
                </p>
              )}
              {presetList.map((preset) => {
                const isSelected = preset.id === selectedPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-ink/50 bg-ink/5 font-semibold text-ink shadow-2xs'
                        : 'border-ink/15 hover:border-ink/30 text-ink/70'
                    }`}
                  >
                    <ProviderIcon icon={preset.icon} size={14} />
                    <span className="truncate">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Name */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. My Provider"
              className="w-full bg-paper border border-ink/20 rounded-md px-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              API Base URL
            </label>
            <div className="relative flex items-center">
              <Globe size={13} className="absolute left-2.5 text-ink/40 pointer-events-none" />
              <input
                type="text"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.currentTarget.value)}
                placeholder="https://api.domain.com/v1"
                className="w-full bg-paper border border-ink/20 rounded-md pl-8 pr-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
              />
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              API Key (stored securely)
            </label>
            <div className="relative flex items-center">
              <Key size={13} className="absolute left-2.5 text-ink/40 pointer-events-none" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                placeholder="sk-••••••••••••••••"
                className="w-full bg-paper border border-ink/20 rounded-md pl-8 pr-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
              />
            </div>
          </div>

          {/* Buttons */}
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
              disabled={isSubmitting || presetList.length === 0}
              className="px-3.5 py-1.5 rounded-md bg-ink text-canvas text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <DownloadCloud size={14} className="animate-pulse" />
                  <span>Fetching models...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Connect Provider</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
