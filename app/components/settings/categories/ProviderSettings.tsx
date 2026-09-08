import { useState, useEffect } from 'react';
import type { ProviderItem, ProviderModel } from '@/types';
import { ProviderSidebarList } from '@/components/settings/categories/provider-settings/ProviderSidebarList';
import { ProviderHeader } from '@/components/settings/categories/provider-settings/ProviderHeader';
import { ProviderAuthSection } from '@/components/settings/categories/provider-settings/ProviderAuthSection';
import { ProviderModelsList } from '@/components/settings/categories/provider-settings/ProviderModelsList';
import { AddProviderModal, type PresetProviderOption } from '@/components/settings/categories/provider-settings/AddProviderModal';
import { ReconnectModal } from '@/components/settings/categories/provider-settings/ReconnectModal';
import { ModelConfigModal } from '@/components/settings/categories/provider-settings/ModelConfigModal';
import { ModelCapabilitiesModal } from '@/components/settings/categories/provider-settings/ModelCapabilitiesModal';

interface ProviderSettingsProps {
  autoOpenAdd?: boolean;
  onAddModalClose?: () => void;
}

export function ProviderSettings({
  autoOpenAdd = false,
  onAddModalClose,
}: ProviderSettingsProps) {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [presetProviders, setPresetProviders] = useState<PresetProviderOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('provider-deepseek');
  const [currentProject, setCurrentProject] = useState('ompchamber');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(autoOpenAdd);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [configModel, setConfigModel] = useState<ProviderModel | null>(null);
  const [capabilitiesModel, setCapabilitiesModel] = useState<ProviderModel | null>(null);

  useEffect(() => {
    if (autoOpenAdd) {
      setIsAddModalOpen(true);
    }
  }, [autoOpenAdd]);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/providers')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data?.providers && Array.isArray(data.providers)) {
          setProviders(data.providers);
          if (data.providers.length > 0) {
            setSelectedProviderId(data.providers[0].id);
          }
        }
        if (data?.presetProviders) {
          setPresetProviders(data.presetProviders);
        }
      })
      .catch(err => console.error('Failed to load providers from API:', err));
    return () => { active = false; };
  }, []);

  // Persistence helper
  const persistProviders = (updated: ProviderItem[]) => {
    setProviders(updated);
    fetch('/api/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: updated }),
    }).catch(err => console.error('Failed to save providers via API:', err));
  };

  const selectedProvider =
    providers.find((p) => p.id === selectedProviderId) || providers[0];

  // Button action: Add new provider
  const handleAddProvider = (newProvider: ProviderItem) => {
    const updated = [...providers, newProvider];
    persistProviders(updated);
    setSelectedProviderId(newProvider.id);
    setIsAddModalOpen(false);
    onAddModalClose?.();

    // Also sync the new provider default models to the catalog endpoint
    if (newProvider.models && newProvider.models.length > 0) {
      Promise.all(
        newProvider.models.map(pm =>
          fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actionType: 'addModel',
              model: {
                id: pm.id,
                name: pm.name,
                provider: newProvider.name,
                contextWindow: pm.contextWindow?.split(' ')[0] || '128K',
                thinkingLevel: 'Default',
                isFavorite: true,
                capabilities: ['Tool calling', 'Reasoning'],
                inputFormats: ['text'],
                outputFormats: ['text'],
              }
            })
          })
        )
      ).then(() => {
        window.dispatchEvent(new CustomEvent('omp:models-updated'));
      }).catch(console.error);
    }
  };

  // Button action: Reconnect / update credentials
  const handleReconnect = (updates: Partial<ProviderItem>) => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return { ...p, ...updates, status: 'connected' as const };
      }
      return p;
    });
    persistProviders(updated);
  };

  // Button action: Disconnect / toggle status
  const handleToggleDisconnect = () => {
    if (!selectedProvider) return;
    const newStatus =
      selectedProvider.status === 'connected' ? ('disconnected' as const) : ('connected' as const);
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return { ...p, status: newStatus };
      }
      return p;
    });
    persistProviders(updated);
  };

  // Button action: Hide all models
  const handleHideAll = () => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          models: p.models.map((m) => ({ ...m, isVisible: false })),
        };
      }
      return p;
    });
    persistProviders(updated);
  };

  // Button action: Show all models
  const handleShowAll = () => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          models: p.models.map((m) => ({ ...m, isVisible: true })),
        };
      }
      return p;
    });
    persistProviders(updated);
  };

  // Button action: Toggle visibility of single model
  const handleToggleModelVisibility = (modelId: string) => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          models: p.models.map((m) =>
            m.id === modelId ? { ...m, isVisible: !m.isVisible } : m
          ),
        };
      }
      return p;
    });
    persistProviders(updated);
  };

  // Button action: Save model configuration (temperature, maxTokens, etc.)
  const handleSaveModelConfig = (modelId: string, updates: Partial<ProviderModel>) => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => {
      if (p.id === selectedProvider.id) {
        return {
          ...p,
          models: p.models.map((m) =>
            m.id === modelId ? { ...m, ...updates } : m
          ),
        };
      }
      return p;
    });
    persistProviders(updated);
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden bg-paper text-ink">
      {/* Left Column: Project Picker, Total Count & Provider List */}
      <ProviderSidebarList
        providers={providers}
        selectedProviderId={selectedProvider?.id || ''}
        onSelectProvider={setSelectedProviderId}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        currentProject={currentProject}
        onSelectProject={setCurrentProject}
      />

      {/* Right Column: Provider Details, Authentication, & Models */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
        {selectedProvider ? (
          <>
            <ProviderHeader provider={selectedProvider} />

            <ProviderAuthSection
              provider={selectedProvider}
              onOpenReconnectModal={() => setIsReconnectModalOpen(true)}
              onToggleDisconnect={handleToggleDisconnect}
            />

            <ProviderModelsList
              models={selectedProvider.models}
              onToggleModelVisibility={handleToggleModelVisibility}
              onHideAll={handleHideAll}
              onShowAll={handleShowAll}
              onOpenModelConfig={(model) => setConfigModel(model)}
              onOpenModelCapabilities={(model) => setCapabilitiesModel(model)}
            />
          </>
        ) : (
          <div className="py-12 text-center text-xs text-ink/40">
            Select a provider from the sidebar to view connection details
          </div>
        )}
      </div>

      {/* Modals */}
      <AddProviderModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          onAddModalClose?.();
        }}
        onAddProvider={handleAddProvider}
        presets={presetProviders}
      />

      {selectedProvider && (
        <ReconnectModal
          isOpen={isReconnectModalOpen}
          provider={selectedProvider}
          onClose={() => setIsReconnectModalOpen(false)}
          onReconnect={handleReconnect}
        />
      )}

      <ModelConfigModal
        isOpen={!!configModel}
        model={configModel}
        onClose={() => setConfigModel(null)}
        onSaveModelConfig={handleSaveModelConfig}
      />

      <ModelCapabilitiesModal
        isOpen={!!capabilitiesModel}
        model={capabilitiesModel}
        onClose={() => setCapabilitiesModel(null)}
      />
    </div>
  );
}
