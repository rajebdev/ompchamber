import { AlertCircle, RefreshCw } from 'lucide-react';
import { ProviderDetail } from '@/components/settings/categories/usage-settings/ProviderDetail';
import {
  buildProviders,
  type UsageProviderId,
} from '@/components/settings/categories/usage-settings/providers';
import { formatDateTime } from '@/components/settings/categories/usage-settings/format';
import { ProviderSelect } from '@/components/workspace/usage-panel/ProviderSelect';
import { useUsageReport } from '@/hooks/settings/useUsageReport';
import { useSessionState } from '@/hooks/workspace/session-state';
import { usePanelRefresh } from '@/hooks/workspace/panel-refresh';

interface UsagePanelProps {
  className?: string;
  /** False while the panel is hidden (desktop right panel / mobile tab):
   *  pauses the auto-refresh poll. */
  active?: boolean;
}

/** Right-panel Usage: the selected provider's balance/quota via a dropdown. */
export function UsagePanel({ className = '', active = true }: UsagePanelProps) {
  const { report, isLoading, error, reload } = useUsageReport();
  const [selectedProviderId, setSelectedProviderId] = useSessionState<UsageProviderId>(
    'usage.selectedProviderId',
    'kenari',
  );

  // Auto refresh: keep balance/quota current without a manual reload. Silent —
  // the spinner stays reserved for the user's own refresh button. Polls only
  // while the panel is actually visible.
  usePanelRefresh(() => reload({ silent: true }), active);

  if (error && !report) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center text-xs ${className}`}>
        <AlertCircle size={16} className="text-error" />
        <p className="text-error text-xs">{error}</p>
        <button
          type="button"
          onClick={() => reload()}
          className="text-[11px] font-semibold text-ink/70 hover:text-ink underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className={`flex h-full w-full items-center justify-center text-ink/40 text-xs ${className}`}>
        Loading provider usage...
      </div>
    );
  }

  const providers = buildProviders(report);

  return (
    <div className={`flex h-full w-full min-w-0 min-h-0 flex-col overflow-hidden bg-paper text-xs text-ink ${className}`}>
      <div className="px-3.5 py-2.5 border-b border-ink/10 flex items-center justify-between gap-3 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-semibold text-ink uppercase tracking-wider">Usage</h2>
          <span className="text-[11px] text-ink/50 truncate">
            Updated {formatDateTime(report.generatedAt)}
          </span>
          {report.isMock && (
            <span className="text-[10px] font-mono uppercase tracking-wider bg-ink/5 border border-ink/15 rounded px-1.5 py-0.5 text-ink/60">
              Mock
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => reload()}
          disabled={isLoading}
          className="p-1.5 bg-paper border border-ink/15 rounded-md hover:bg-ink/5 text-ink/80 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Refresh usage"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin text-ink' : ''} />
        </button>
      </div>

      <div className="px-3.5 py-2.5 border-b border-ink/10 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-ink/60 flex-shrink-0">Provider</span>
          <ProviderSelect
            providers={providers}
            value={selectedProviderId}
            onChange={setSelectedProviderId}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 min-h-0 w-full overflow-y-auto scrollbar-overlay-container scrollbar-overlay-static p-3.5 space-y-4">
        {error && <p className="text-error text-xs">{error}</p>}
        <ProviderDetail providerId={selectedProviderId} report={report} />
      </div>
    </div>
  );
}
