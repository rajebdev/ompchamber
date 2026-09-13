import type { KenariUsageReport } from '@/types';
import { StatCard } from '@/components/settings/categories/usage-settings/StatCard';
import { QuotaSection } from '@/components/settings/categories/usage-settings/QuotaSection';
import { UsageTable } from '@/components/settings/categories/usage-settings/UsageTable';
import { formatNumber, formatRp } from '@/components/settings/categories/usage-settings/format';

interface KenariCardProps {
  report: KenariUsageReport;
}

/** kenari.id wallet balance, plan quota, and 30-day usage. */
export function KenariCard({ report }: KenariCardProps) {
  const { balance, usage, quota } = report;

  if (!balance && !usage && !quota) {
    return <p className="text-[11px] text-ink/50">No kenari data was returned for this account.</p>;
  }

  const balanceValue = balance
    ? balance.amountRp !== null
      ? formatRp(balance.amountRp)
      : balance.raw
    : '—';
  const balanceHint = balance
    ? balance.amountRp !== null
      ? balance.raw
      : 'Amount could not be parsed'
    : 'Balance unavailable';

  const processedTokens = usage
    ? usage.rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0)
    : 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-stretch">
        <StatCard value={balanceValue} label="Wallet balance" hint={balanceHint} />
        <StatCard
          value={quota?.planName ?? '—'}
          label="Active plan"
          hint={quota ? 'kenari quota plan' : 'Quota unavailable'}
        />
        <StatCard
          value={usage ? formatNumber(usage.totalRequests) : '—'}
          label="Requests (30 days)"
          hint={usage ? 'Across all models' : 'Usage report unavailable'}
        />
        <StatCard
          value={usage ? formatRp(usage.totalCostRp) : '—'}
          label="Cost (30 days)"
          hint={usage ? 'Billed in Rupiah' : 'Usage report unavailable'}
        />
        <StatCard
          value={usage ? formatNumber(processedTokens) : '—'}
          label="Tokens processed (30 days)"
          hint={usage ? 'Input + output' : 'Usage report unavailable'}
          tone="muted"
        />
      </div>

      <QuotaSection quota={quota} />
      <UsageTable usage={usage} />
    </>
  );
}
