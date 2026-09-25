import { ToastStack } from '@/client/components/common/ToastStack';
import { useProviderSettings } from '@/client/hooks/settings/providers';
import { ProviderSidebarList } from '@/client/components/settings/categories/provider-settings/SidebarList';
import { ProviderHeader } from '@/client/components/settings/categories/provider-settings/Header';
import { ProviderAuthSection } from '@/client/components/settings/categories/provider-settings/AuthSection';
import { ProviderModelsList } from '@/client/components/settings/categories/provider-settings/ModelsList';
import { AddProviderModal } from '@/client/components/settings/categories/provider-settings/AddProviderModal';
import { ReconnectModal } from '@/client/components/settings/categories/provider-settings/ReconnectModal';
import { LoginModal } from '@/client/components/settings/categories/provider-settings/LoginModal';
import { ModelConfigModal } from '@/client/components/settings/categories/provider-settings/ModelConfigModal';
import { ModelCapabilitiesModal } from '@/client/components/settings/categories/provider-settings/ModelCapabilitiesModal';
import { AddModelModal } from '@/client/components/settings/categories/provider-settings/AddModelModal';
import { DeleteProviderModal } from '@/client/components/settings/categories/provider-settings/DeleteProviderModal';
import { providerEmptyReason } from '@/shared/lib/models/provider/dialect';
import { configuredProviderSlugs } from '@/shared/lib/models/provider/presets';

interface ProviderSettingsProps {
  autoOpenAdd?: boolean;
  onAddModalClose?: () => void;
}

export function ProviderSettings({
  autoOpenAdd = false,
  onAddModalClose,
}: ProviderSettingsProps) {
  const {
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
    isAddModelModalOpen,
    setIsAddModelModalOpen,
    handleModelAdded,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    isDeletingProvider,
    handleDeleteProvider,
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
    handleToggleProviderDisabled,
    handleHideAll,
    handleShowAll,
    handleToggleModelVisibility,
    handleSaveModelConfig,
  } = useProviderSettings({ autoOpenAdd, onAddModalClose });

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
                // A provider omp signs in through `/login` needs the OAuth
                // dialog; one whose endpoint and key live in models.yml (or the
                // chamber overlay) is edited in place. Testing the provider ID
                // for `omp-auth-` was wrong: a native models.yml entry shares
                // that ID prefix once merged, and a keyless local server has no
                // login flow to complete at all.
                if (selectedProvider.credentialSource === 'omp-auth' && selectedProvider.auth !== 'none') {
                  setIsLoginModalOpen(true);
                } else {
                  setIsReconnectModalOpen(true);
                }
              }}
              onToggleDisconnect={handleToggleDisconnect}
              onToggleDisabled={handleToggleProviderDisabled}
              onDelete={() => setIsDeleteModalOpen(true)}
            />

            <ProviderModelsList
              models={selectedProvider.models}
              emptyReason={providerEmptyReason(selectedProvider)}
              onToggleModelVisibility={handleToggleModelVisibility}
              onHideAll={handleHideAll}
              onShowAll={handleShowAll}
              onFetchModels={handleFetchModelsFromList}
              onAddModel={() => setIsAddModelModalOpen(true)}
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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <AddProviderModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          onAddModalClose?.();
        }}
        onAddProvider={handleAddProvider}
        presets={availablePresetProviders}
        existingSlugs={configuredProviderSlugs(providers)}
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

      {selectedProvider && (
        <AddModelModal
          isOpen={isAddModelModalOpen}
          provider={selectedProvider}
          onClose={() => setIsAddModelModalOpen(false)}
          onAdded={(modelId) => void handleModelAdded(modelId)}
          onError={(message) => pushToast(message, 'error')}
        />
      )}

      <DeleteProviderModal
        isOpen={isDeleteModalOpen}
        provider={selectedProvider ?? null}
        isDeleting={isDeletingProvider}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => void handleDeleteProvider()}
      />

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
