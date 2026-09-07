import React, { useState, useEffect } from 'react';
import type { SettingsState, ProviderItem, ProviderModel } from '@/types';
import { DEFAULT_PROVIDERS_LIST } from '@/data/providerData';
import { ProviderSidebarList } from './provider-settings/ProviderSidebarList';
import { ProviderHeader } from './provider-settings/ProviderHeader';
import { ProviderAuthSection } from './provider-settings/ProviderAuthSection';
import { ProviderModelsList } from './provider-settings/ProviderModelsList';
import { AddProviderModal } from './provider-settings/AddProviderModal';
import { ReconnectModal } from './provider-settings/ReconnectModal';
import { ModelConfigModal } from './provider-settings/ModelConfigModal';
import { ModelCapabilitiesModal } from './provider-settings/ModelCapabilitiesModal';

interface ProviderSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ProviderSettings({ settings, onUpdate }: ProviderSettingsProps) {
  const [providers, setProviders] = useState<ProviderItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_providers_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        // Fallback to default
      }
    }
    return DEFAULT_PROVIDERS_LIST;
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    return providers[0]?.id || 'provider-deepseek';
  });

  const [currentProject, setCurrentProject] = useState('ompchamber');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [configModel, setConfigModel] = useState<ProviderModel | null>(null);
  const [capabilitiesModel, setCapabilitiesModel] = useState<ProviderModel | null>(null);

  // Persistence helper
  const persistProviders = (updated: ProviderItem[]) => {
    setProviders(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('omp_providers_config', JSON.stringify(updated));
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ omp_providers_config: updated }),
        }).catch(() => {});
      } catch (e) {
        // Silent error
      }
    }
  };

  const selectedProvider =
    providers.find((p) => p.id === selectedProviderId) || providers[0];

  // Button action: Add new provider
  const handleAddProvider = (newProvider: ProviderItem) => {
    const updated = [...providers, newProvider];
    persistProviders(updated);
    setSelectedProviderId(newProvider.id);
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
        onClose={() => setIsAddModalOpen(false)}
        onAddProvider={handleAddProvider}
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
