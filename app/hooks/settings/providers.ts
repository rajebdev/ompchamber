import { useEffect, useMemo, useState } from 'react';
import type { PresetProviderOption, ProviderItem, ProviderModel } from '@/types';
import { PRESET_NEW_PROVIDERS } from '@/data/settings/provider';
import {
  fetchProviderModelsRemote,
  mergeProviderModels,
  syncProviderModelsToCatalog,
} from '@/lib/models/provider-models';
import { buildAvailableProviderPresets } from '@/lib/models/provider-presets';
import { removeLegacyKenariModels } from '@/lib/models/provider-cleanup';
import { notifyModelsUpdated } from '@/lib/models/client';
import { saveProviderOverlay, setProviderEnabled } from '@/lib/models/provider-connection';
import { useToasts } from '@/hooks/ui/toasts';

interface UseProviderSettingsOptions {
  autoOpenAdd?: boolean;
  onAddModalClose?: () => void;
}

/**
 * State and actions behind Settings → Providers. Every mutation lands in one of
 * two stores: the chamber-local overlay (per-model visibility and sampling
 * config) or omp's own config.yml disabledProviders (connect / disconnect).
 * Disconnect has to use the latter — the overlay is re-merged away on load,
 * which is why a disconnected provider used to come back as connected.
 */
export function useProviderSettings({
  autoOpenAdd = false,
  onAddModalClose,
}: UseProviderSettingsOptions = {}) {
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
    if (autoOpenAdd) setIsAddModalOpen(true);
  }, [autoOpenAdd]);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/providers')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data?.providers && Array.isArray(data.providers)) {
          setProviders(data.providers);
          const connected = data.providers.filter((p: ProviderItem) => p.status === 'connected');
          setSelectedProviderId(connected.length > 0 ? connected[0].id : '');
        }
        if (data?.presetProviders) setPresetProviders(data.presetProviders);
      })
      .catch(err => console.error('Failed to load providers from API:', err));
    return () => { active = false; };
  }, []);

  const connectedProviders = useMemo(
    () => providers.filter((provider) => provider.status === 'connected'),
    [providers],
  );
  const availablePresetProviders = useMemo(
    () => buildAvailableProviderPresets(providers, presetProviders),
    [providers, presetProviders],
  );
  const selectedProvider = connectedProviders.find((p) => p.id === selectedProviderId) || connectedProviders[0];

  const persistProviders = async (updated: ProviderItem[]) => {
    setProviders(updated);
    try {
      const merged = await saveProviderOverlay(updated);
      if (merged) setProviders(merged);
    } catch (err) {
      console.error('Failed to save providers via API:', err);
      pushToast('Failed to save provider settings.', 'error');
    }
  };

  const toggleProviderEnabled = async (
    slug: string,
    enabled: boolean,
  ): Promise<ProviderItem[] | null> => {
    try {
      const merged = await setProviderEnabled(slug, enabled);
      if (merged) setProviders(merged);
      return merged;
    } catch (err) {
      console.error('Failed to update provider connection:', err);
      pushToast('Failed to update the provider connection.', 'error');
      return null;
    }
  };

  const handleAddProvider = async (newProvider: ProviderItem, options: { fetchedCount: number }) => {
    await persistProviders([...providers, newProvider]);
    const merged = await toggleProviderEnabled(newProvider.slug, true);
    const registered = merged?.find(
      (provider) => provider.slug.trim().toLowerCase() === newProvider.slug.trim().toLowerCase(),
    );
    setSelectedProviderId(registered?.id || newProvider.id);
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

    void syncProviderModelsToCatalog(newProvider.name, newProvider.models);
  };

  const handleReconnect = async (updates: Partial<ProviderItem>) => {
    if (!selectedProvider) return;
    const target = selectedProvider;
    await persistProviders(providers.map((p) => (
      p.id === target.id ? { ...p, ...updates, status: 'connected' as const } : p
    )));
    if (target.status !== 'connected') {
      await toggleProviderEnabled(target.slug, true);
    }
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
      const cleanedExistingModels = removeLegacyKenariModels(selectedProvider, selectedProvider.models);
      const removedCount = selectedProvider.models.length - cleanedExistingModels.length;
      const { merged, addedCount } = mergeProviderModels(cleanedExistingModels, result.models);
      if (addedCount > 0 || removedCount > 0) {
        await handleReconnect({ models: merged });
      }
      if (result.omp?.written) {
        notifyModelsUpdated();
      }
      if (addedCount > 0) {
        pushToast(`Fetched ${addedCount} new model${addedCount === 1 ? '' : 's'} from the provider.`, 'success');
      } else if (removedCount > 0) {
        pushToast('Removed legacy fallback models from the provider.', 'success');
      } else {
        pushToast('No new models found — all fetched models already exist.', 'success');
      }
      if (result.omp?.written) {
        const parts: string[] = [];
        if (result.omp.addedCount > 0) parts.push(`${result.omp.addedCount} new model${result.omp.addedCount === 1 ? '' : 's'} registered`);
        if (result.omp.backfilledCount > 0) parts.push(`${result.omp.backfilledCount} model${result.omp.backfilledCount === 1 ? '' : 's'} enriched`);
        pushToast(`omp models.yml updated${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.`, 'success');
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
    const target = selectedProvider;
    void persistProviders(providers.map((p) => (
      p.id === target.id ? { ...p, status: 'connected' as const } : p
    )));
    void toggleProviderEnabled(target.slug, true);
  };

  const handleToggleDisconnect = async () => {
    if (!selectedProvider) return;
    const target = selectedProvider;
    const disconnecting = target.status === 'connected';
    if (disconnecting) {
      setSelectedProviderId(
        connectedProviders.find((provider) => provider.id !== target.id)?.id || '',
      );
    }
    const merged = await toggleProviderEnabled(target.slug, !disconnecting);
    if (!merged) return;
    pushToast(
      disconnecting
        ? `${target.name} disconnected — its models are no longer offered in the chat picker.`
        : `${target.name} reconnected.`,
      'success',
    );
  };

  const updateSelectedModels = (transform: (models: ProviderModel[]) => ProviderModel[]) => {
    if (!selectedProvider) return;
    void persistProviders(providers.map((p) => (
      p.id === selectedProvider.id ? { ...p, models: transform(p.models) } : p
    )));
  };

  const handleHideAll = () => updateSelectedModels(
    (models) => models.map((m) => ({ ...m, isVisible: false })),
  );

  const handleShowAll = () => updateSelectedModels(
    (models) => models.map((m) => ({ ...m, isVisible: true })),
  );

  const handleToggleModelVisibility = (modelId: string) => updateSelectedModels(
    (models) => models.map((m) => (m.id === modelId ? { ...m, isVisible: !m.isVisible } : m)),
  );

  const handleSaveModelConfig = (modelId: string, updates: Partial<ProviderModel>) => updateSelectedModels(
    (models) => models.map((m) => (m.id === modelId ? { ...m, ...updates } : m)),
  );

  return {
    providers,
    connectedProviders,
    availablePresetProviders,
    selectedProvider,
    currentProject,
    setCurrentProject,
    isFetchingModels,
    toasts,
    pushToast,
    dismissToast,
    isAddModalOpen,
    setIsAddModalOpen,
    isReconnectModalOpen,
    setIsReconnectModalOpen,
    isLoginModalOpen,
    setIsLoginModalOpen,
    configModel,
    setConfigModel,
    capabilitiesModel,
    setCapabilitiesModel,
    setSelectedProviderId,
    handleAddProvider,
    handleReconnect,
    handleFetchModels,
    handleFetchModelsFromList,
    handleOmpAuthSuccess,
    handleToggleDisconnect,
    handleHideAll,
    handleShowAll,
    handleToggleModelVisibility,
    handleSaveModelConfig,
  };
}
