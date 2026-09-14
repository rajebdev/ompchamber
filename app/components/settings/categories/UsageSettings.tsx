import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { UsageSidebarList } from '@/components/settings/categories/usage-settings/SidebarList';
import type { UsageProviderId } from '@/components/settings/categories/usage-settings/providers';
import { ProviderDetail } from '@/components/settings/categories/usage-settings/ProviderDetail';
import { formatDateTime } from '@/components/settings/categories/usage-settings/format';
import { useUsageReport } from '@/hooks/settings/useUsageReport';

/** Settings → Usage: provider balances, quota, and 30-day spend. */
export function UsageSettings() {
  const { report, isLoading, error, reload } = useUsageReport();
  const [selectedProviderId, setSelectedProviderId] = useState<UsageProviderId>('kenari');

  if (error && !report) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center text-xs">
        <AlertCircle size={16} className="text-error" />
        <p className="text-error text-xs">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="text-[11px] font-semibold text-ink/70 hover:text-ink underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full w-full items-center justify-center text-ink/40 text-xs">
        Loading provider usage...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper text-xs text-ink">
      <UsageSidebarList
        report={report}
        selectedProviderId={selectedProviderId}
        onSelectProvider={setSelectedProviderId}
      />

      <div className="flex-1 h-full overflow-hidden flex flex-col">
        <div className="px-3.5 py-2.5 border-b border-ink/10 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-ink/75 truncate">
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
            onClick={reload}
            disabled={isLoading}
            className="p-1.5 bg-paper border border-ink/15 rounded-md hover:bg-ink/5 text-ink/80 transition-colors disabled:opacity-50 flex-shrink-0"
            title="Refresh usage"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin text-ink' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-overlay-container scrollbar-overlay-static p-3.5 space-y-4">
          {error && <p className="text-error text-xs">{error}</p>}

          <ProviderDetail providerId={selectedProviderId} report={report} />
        </div>
      </div>
    </div>
  );
}
