import { useState } from 'preact/hooks';
import { AlertCircle, Check, Info } from 'lucide-preact';
import type { ProviderItem } from '@/shared/types';

interface ProviderAuthSectionProps {
  provider: ProviderItem;
  onOpenReconnectModal: () => void;
  onToggleDisconnect: () => void;
}

export function ProviderAuthSection({
  provider,
  onOpenReconnectModal,
  onToggleDisconnect,
}: ProviderAuthSectionProps) {
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const isConnected = provider.status === 'connected';

  return (
    <div className="space-y-6">
      {/* 1. Authentication Section */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-ink">
          Authentication
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
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
                  {isConnected
                    ? 'Endpoint validated and operational for agent inference'
                    : 'Provider authentication is currently offline or inactive'}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenReconnectModal}
            className="px-3 py-1.5 rounded-md bg-ink/5 hover:bg-ink/10 text-ink text-xs font-medium transition-colors cursor-pointer border border-ink/10"
          >
            {isConnected ? 'reconnect' : 'connect'}
          </button>
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
      </div>

      <div className="border-b border-ink/10" />
    </div>
  );
}
