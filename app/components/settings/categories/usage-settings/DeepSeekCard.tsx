import type { DeepSeekUsageReport } from '@/types';
import { StatCard } from '@/components/settings/categories/usage-settings/StatCard';
import { formatAmount, formatNumber } from '@/components/settings/categories/usage-settings/format';

interface DeepSeekCardProps {
  report: DeepSeekUsageReport;
}

/** DeepSeek prepaid balance; the provider exposes no usage/quota API. */
export function DeepSeekCard({ report }: DeepSeekCardProps) {
  const balance = report.balance;

  if (!balance) {
    return <p className="text-[11px] text-ink/50">DeepSeek balance data is not available.</p>;
  }

  return (
    <>
      <div className="@container">
        <div className="grid grid-cols-3 @[540px]:grid-cols-5 gap-2.5 items-stretch">
          <StatCard
            value={balance.isAvailable ? 'Available' : 'Unavailable'}
            label="Prepaid balance"
            hint={balance.isAvailable ? 'Account can spend' : 'Top up required'}
            tone={balance.isAvailable ? 'default' : 'muted'}
          />
          <StatCard
            value={formatNumber(balance.entries.length)}
            label="Currency buckets"
            hint={balance.entries.length > 0 ? 'From the balance endpoint' : 'No entries returned'}
            tone="muted"
          />
        </div>
      </div>

      {balance.entries.length === 0 ? (
        <p className="text-[11px] text-ink/50">The balance endpoint returned no currency entries.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {balance.entries.map((entry) => (
            <div key={entry.currency} className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-semibold text-ink">{entry.currency}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink/40">Balance</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <dt className="text-ink/50">Total</dt>
                  <dd className="font-semibold text-ink tabular-nums break-words">{formatAmount(entry.totalBalance)}</dd>
                </div>
                <div>
                  <dt className="text-ink/50">Granted</dt>
                  <dd className="font-semibold text-ink tabular-nums break-words">{formatAmount(entry.grantedBalance)}</dd>
                </div>
                <div>
                  <dt className="text-ink/50">Topped up</dt>
                  <dd className="font-semibold text-ink tabular-nums break-words">{formatAmount(entry.toppedUpBalance)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
