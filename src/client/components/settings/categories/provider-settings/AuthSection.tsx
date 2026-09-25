import { useState } from 'preact/hooks';
import { AlertCircle, Ban, Check, Info, Trash2 } from 'lucide-preact';
import type { ProviderItem } from '@/shared/types';

interface ProviderAuthSectionProps {
  provider: ProviderItem;
  onOpenReconnectModal: () => void;
  onToggleDisconnect: () => void;
  /** Adds/removes the provider in omp's config.yml `disabledProviders`. */
  onToggleDisabled: () => void;
  /** Opens the delete confirmation for a provider registered in models.yml. */
  onDelete: () => void;
}

export function ProviderAuthSection({
  provider,
  onOpenReconnectModal,
  onToggleDisconnect,
  onToggleDisabled,
  onDelete,
}: ProviderAuthSectionProps) {
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const isConnected = provider.status === 'connected';
  const isDisabled = provider.disabled === true;

  return (
    <div className="space-y-6">
      {/* 1. Authentication Section */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-ink">
          Authentication
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {isDisabled ? (
              <>
                <Ban size={15} className="text-ink/50 flex-shrink-0" strokeWidth={2.4} />
                <span className="text-xs font-medium text-ink/70">Disabled</span>
              </>
            ) : isConnected ? (
              <>
                <Check size={15} className="text-emerald-500 flex-shrink-0" strokeWidth={2.4} />
                <span className="text-xs font-medium text-ink">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle size={15} className="text-error flex-shrink-0" strokeWidth={2.4} />
                <span className="text-xs font-medium text-error">Disconnected</span>
              </>
            )}

            <div
              className="relative inline-block cursor-help ml-0.5"
              onMouseEnter={() => setShowInfoTooltip(true)}
              onMouseLeave={() => setShowInfoTooltip(false)}
            >
              <Info size={13} className="text-ink/40 hover:text-ink/70 transition-colors" />
              {showInfoTooltip && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-ink text-canvas text-[10px] rounded px-2.5 py-1.5 shadow-xl whitespace-nowrap z-50 pointer-events-none">
                  {isDisabled
                    ? 'Provider is disabled — none of its models appear in the chat model list'
                    : isConnected
                      ? 'Endpoint validated and operational for agent inference'
                      : 'Provider authentication is currently offline or inactive'}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDisabled}
              title={isDisabled ? 'Offer this provider in the model list again' : 'Remove this provider from the model list'}
              className="px-3 py-1.5 rounded-md bg-ink/5 hover:bg-ink/10 text-ink text-xs font-medium transition-colors cursor-pointer border border-ink/10"
            >
              {isDisabled ? 'enable' : 'disable'}
            </button>

            <button
              type="button"
              onClick={onOpenReconnectModal}
              className="px-3 py-1.5 rounded-md bg-ink/5 hover:bg-ink/10 text-ink text-xs font-medium transition-colors cursor-pointer border border-ink/10"
            >
              {isConnected ? 'reconnect' : 'connect'}
            </button>

            {/* Delete only exists for a provider that HAS a models.yml entry:
                there is nothing in the file to remove otherwise, and the button
                would promise an action it cannot perform. A login provider's
                credential is never touched by this. */}
            {provider.inModelsYml && (
              <button
                type="button"
                onClick={onDelete}
                title="Remove this provider's models.yml entry"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-error/10 hover:bg-error/20 text-error text-xs font-medium transition-colors cursor-pointer border border-error/30"
              >
                <Trash2 size={12} />
                <span>delete</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-ink/10" />

      {/* 2. Connection Details Section */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-ink">
          Connection Details
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-ink/70">
            Configured in: <span className="font-mono text-ink font-medium">{provider.configuredIn}</span>
          </div>

          {isConnected ? (
            <button
              type="button"
              onClick={onToggleDisconnect}
              className="text-xs text-error/90 hover:text-error font-medium hover:underline transition-colors cursor-pointer"
            >
              disconnect
            </button>
          ) : (
            <span className="text-xs text-ink/40 italic">
              inactive
            </span>
          )}
        </div>

        {/* Dialect: the wire api and auth mode omp will use. A provider whose
            endpoint is right but whose dialect is wrong fails on every request,
            so it belongs next to the connection status rather than in a log. */}
        {(provider.api || provider.auth || provider.discovery) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {provider.api && (
              <span
                className="px-1.5 py-0.5 rounded border border-ink/15 text-[10px] font-mono text-ink/70"
                title="Wire API omp uses for this provider"
              >
                {provider.api}
              </span>
            )}
            {provider.auth && provider.auth !== 'apiKey' && (
              <span
                className="px-1.5 py-0.5 rounded border border-ink/15 text-[10px] font-mono text-ink/70"
                title="Auth mode from models.yml"
              >
                auth: {provider.auth}
              </span>
            )}
            {provider.discovery && (
              <span
                className="px-1.5 py-0.5 rounded border border-ink/15 text-[10px] font-mono text-ink/70"
                title="omp lists this provider's models live"
              >
                discovery: {provider.discovery}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="border-b border-ink/10" />
    </div>
  );
}
