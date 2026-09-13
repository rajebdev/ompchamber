import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { UsageReport } from '@/types';
import { ProviderCard } from '@/components/settings/categories/usage-settings/ProviderCard';
import { KenariCard } from '@/components/settings/categories/usage-settings/KenariCard';
import { DeepSeekCard } from '@/components/settings/categories/usage-settings/DeepSeekCard';
import { formatDateTime } from '@/components/settings/categories/usage-settings/format';

/** Settings → Usage: provider balances, quota, and 30-day spend. */
export function UsageSettings() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/usage');
      if (!response.ok) throw new Error(`Usage request failed (${response.status})`);
      const data = (await response.json()) as UsageReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider usage');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  return (
    <div className="w-full space-y-4 text-ink pb-2 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink/75">
            {report ? `Updated ${formatDateTime(report.generatedAt)}` : 'Provider balances & quota'}
          </span>
          {report?.isMock && (
            <span className="text-[10px] font-mono uppercase tracking-wider bg-ink/5 border border-ink/15 rounded px-1.5 py-0.5 text-ink/60">
              Mock
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={isLoading}
          className="self-start sm:self-auto p-1.5 bg-paper border border-ink/15 rounded-md hover:bg-ink/5 text-ink/80 transition-colors disabled:opacity-50"
          title="Refresh usage"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin text-ink' : ''} />
        </button>
      </div>

      {error && !report ? (
        <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
          <AlertCircle size={16} className="text-error" />
          <p className="text-error text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadUsage()}
            className="text-[11px] font-semibold text-ink/70 hover:text-ink underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : !report ? (
        <div className="flex items-center justify-center p-8 text-ink/40 text-xs">
          Loading provider usage...
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-error text-xs">{error}</p>}

          <ProviderCard
            providerName="Kenari.id"
            configured={report.kenari.configured}
            error={report.kenari.error}
          >
            <KenariCard report={report.kenari} />
          </ProviderCard>

          <ProviderCard
            providerName="DeepSeek"
            configured={report.deepseek.configured}
            error={report.deepseek.error}
            note="DeepSeek exposes no usage or quota API — only the prepaid balance (and the web console at platform.deepseek.com) is available."
          >
            <DeepSeekCard report={report.deepseek} />
          </ProviderCard>
        </div>
      )}
    </div>
  );
}
