import { useState, useEffect, useMemo } from 'react';
import type { PresetProviderOption, ProviderItem, ProviderModel } from '@/types';
import { PRESET_NEW_PROVIDERS } from '@/data/settings/provider';
import {
  fetchProviderModelsRemote,
  mergeProviderModels,
  syncProviderModelsToCatalog,
} from '@/lib/models/provider-models';
import { buildAvailableProviderPresets } from '@/lib/models/provider-presets';
import { useToasts } from '@/hooks/ui/toasts';
import { Toast } from '@/components/common/Toast';
import { ProviderSidebarList } from '@/components/settings/categories/provider-settings/SidebarList';
import { ProviderHeader } from '@/components/settings/categories/provider-settings/Header';
import { ProviderAuthSection } from '@/components/settings/categories/provider-settings/AuthSection';
import { ProviderModelsList } from '@/components/settings/categories/provider-settings/ModelsList';
import { AddProviderModal } from '@/components/settings/categories/provider-settings/AddProviderModal';
import { ReconnectModal } from '@/components/settings/categories/provider-settings/ReconnectModal';
import { LoginModal } from '@/components/settings/categories/provider-settings/LoginModal';
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
  const [presetProviders, setPresetProviders] = useState<PresetProviderOption[]>(PRESET_NEW_PROVIDERS);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('provider-deepseek');
  const [currentProject, setCurrentProject] = useState('ompchamber');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();

  const [isAddModalOpen, setIsAddModalOpen] = useState(autoOpenAdd);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
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
          const connectedProviders = data.providers.filter(
            (provider: ProviderItem) => provider.status === 'connected',
          );
          if (connectedProviders.length > 0) {
            setSelectedProviderId(connectedProviders[0].id);
          } else {
            setSelectedProviderId('');
          }
        }
        if (data?.presetProviders) {
          setPresetProviders(data.presetProviders);
        }
      })
      .catch(err => {
        console.error('Failed to load providers from API:', err);
      });
    return () => { active = false; };
  }, []);

  const persistProviders = (updated: ProviderItem[]) => {
    setProviders(updated);
    fetch('/api/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: updated }),
    }).catch(err => console.error('Failed to save providers via API:', err));
  };

  const connectedProviders = useMemo(
    () => providers.filter((provider) => provider.status === 'connected'),
    [providers],
  );
  const availablePresetProviders = useMemo(
    () => buildAvailableProviderPresets(providers, presetProviders),
    [providers, presetProviders],
  );
  const selectedProvider = connectedProviders.find((p) => p.id === selectedProviderId) || connectedProviders[0];

  const handleAddProvider = (newProvider: ProviderItem, options: { fetchedCount: number }) => {
    const updated = [...providers, newProvider];
    persistProviders(updated);
    setSelectedProviderId(newProvider.id);
    setIsAddModalOpen(false);
    onAddModalClose?.();

    if (options.fetchedCount > 0) {
      pushToast(
        `Fetched ${options.fetchedCount} new model${options.fetchedCount === 1 ? '' : 's'} from the provider.`,
        'success',
      );
    } else if (options.fetchedCount === -1) {
      pushToast('Auto-fetch models failed — provider added with default models.', 'error');
    }

    // Also sync the new provider default models to the catalog endpoint
    void syncProviderModelsToCatalog(newProvider.name, newProvider.models);
  };

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

  const handleFetchModels = async (credentials: { apiKey?: string; baseUrl?: string }) => {
    if (!selectedProvider || isFetchingModels) return;
    const baseUrl = credentials.baseUrl || selectedProvider.baseUrl;
    if (!baseUrl) {
      pushToast('Base URL is required to fetch models.', 'error');
      return;
    }
    setIsFetchingModels(true);
    try {
      const result = await fetchProviderModelsRemote(
        baseUrl,
        credentials.apiKey || selectedProvider.apiKey,
        selectedProvider.slug,
        true,
      );
      if (!result.ok || !result.models) {
        pushToast(result.error || 'Failed to fetch models from the provider.', 'error');
        return;
      }
      const { merged, addedCount } = mergeProviderModels(selectedProvider.models, result.models);
      if (addedCount === 0) {
        pushToast('No new models found — all fetched models already exist.', 'success');
        return;
      }
      handleReconnect({ models: merged });
      pushToast(`Fetched ${addedCount} new model${addedCount === 1 ? '' : 's'} from the provider.`, 'success');
      if (result.omp?.written) {
        const parts: string[] = [];
        if (result.omp.addedCount > 0) parts.push(`${result.omp.addedCount} new model${result.omp.addedCount === 1 ? '' : 's'} registered`);
        if (result.omp.backfilledCount > 0) parts.push(`${result.omp.backfilledCount} model${result.omp.backfilledCount === 1 ? '' : 's'} enriched`);
        pushToast(`omp models.yml updated: ${parts.join(', ')}.`, 'success');
      } else if (result.omp && !result.omp.written && result.omp.reason) {
        pushToast(`omp models.yml not updated: ${result.omp.reason}`, 'error');
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleFetchModelsFromList = async () => {
    if (!selectedProvider) return;
    await handleFetchModels({
      apiKey: selectedProvider.apiKey,
      baseUrl: selectedProvider.baseUrl,
    });
  };

  const handleOmpAuthSuccess = () => {
    if (!selectedProvider) return;
    const updated = providers.map((p) => (
      p.id === selectedProvider.id ? { ...p, status: 'connected' as const } : p
    ));
    setProviders(updated);
  };

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
    setSelectedProviderId(connectedProviders.find((provider) => provider.id !== selectedProvider.id)?.id || '');
  };

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
      <ProviderSidebarList
        providers={connectedProviders}
        selectedProviderId={selectedProvider?.id || ''}
        onSelectProvider={setSelectedProviderId}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        currentProject={currentProject}
        onSelectProject={setCurrentProject}
      />

      <div className="flex-1 scrollbar-overlay-container scrollbar-overlay-static p-6 md:p-8 space-y-6">
        {selectedProvider ? (
          <>
            <ProviderHeader provider={selectedProvider} />

            <ProviderAuthSection
              provider={selectedProvider}
              onOpenReconnectModal={() => {
                if (selectedProvider.id.startsWith('omp-auth-')) setIsLoginModalOpen(true);
                else setIsReconnectModalOpen(true);
              }}
              onToggleDisconnect={handleToggleDisconnect}
            />

            <ProviderModelsList
              models={selectedProvider.models}
              onToggleModelVisibility={handleToggleModelVisibility}
              onHideAll={handleHideAll}
              onShowAll={handleShowAll}
              onFetchModels={handleFetchModelsFromList}
              canFetchModels={Boolean(selectedProvider.baseUrl)}
              isFetchingModels={isFetchingModels}
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

      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}

      <AddProviderModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          onAddModalClose?.();
        }}
        onAddProvider={handleAddProvider}
        presets={availablePresetProviders}
      />

      {selectedProvider && (
        <ReconnectModal
          isOpen={isReconnectModalOpen}
          provider={selectedProvider}
          isFetchingModels={isFetchingModels}
          onClose={() => setIsReconnectModalOpen(false)}
          onReconnect={handleReconnect}
          onFetchModels={handleFetchModels}
        />
      )}

      {selectedProvider && (
        <LoginModal
          isOpen={isLoginModalOpen}
          provider={selectedProvider}
          onClose={() => setIsLoginModalOpen(false)}
          onAuthenticated={handleOmpAuthSuccess}
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
