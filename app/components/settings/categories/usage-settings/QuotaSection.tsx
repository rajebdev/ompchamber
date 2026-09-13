import { Ticket } from 'lucide-react';
import type { KenariCoupon, KenariQuota, KenariQuotaWindow } from '@/types';
import { formatDateTime, formatPercent, formatRp, usedPercent } from '@/components/settings/categories/usage-settings/format';

interface QuotaWindowRowProps {
  window: KenariQuotaWindow;
}

function QuotaWindowRow({ window }: QuotaWindowRowProps) {
  const total = window.usedRp + window.remainingRp;
  const percent = usedPercent(window.usedRp, total);

  return (
    <div className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink">{window.label}</span>
        <span className="text-[10px] text-ink/50">Resets {formatDateTime(window.resetsAt)}</span>
      </div>
      <div className="h-1.5 w-full bg-ink/10 rounded-full overflow-hidden">
        <div className="h-full bg-ink/80 rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] text-ink/60">
        <span>
          Used <span className="font-semibold text-ink">{formatRp(window.usedRp)}</span> ·{' '}
          {formatPercent(window.usedRp, total)}
        </span>
        <span>
          Remaining <span className="font-semibold text-ink">{formatRp(window.remainingRp)}</span>
        </span>
      </div>
    </div>
  );
}

function CouponBlock({ coupon }: { coupon: KenariCoupon }) {
  return (
    <div className="bg-ink/5 border border-ink/10 rounded-lg p-3 shadow-xs">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Ticket size={12} className="text-ink/60" />
        <span className="text-[11px] font-semibold text-ink">Active coupon · {coupon.name}</span>
      </div>
      <div className="text-[10px] text-ink/60 space-y-0.5">
        <div>
          Remaining{' '}
          <span className="font-semibold text-ink">
            {coupon.remainingRp === null ? 'Unlimited' : formatRp(coupon.remainingRp)}
          </span>{' '}
          · Used <span className="font-semibold text-ink">{formatRp(coupon.usedRp)}</span>
        </div>
        <div>Expires {formatDateTime(coupon.expiresAt)}</div>
        {coupon.scopeModels.length > 0 && <div>Models: {coupon.scopeModels.join(', ')}</div>}
      </div>
    </div>
  );
}

interface QuotaSectionProps {
  quota?: KenariQuota;
}

/** Plan windows (used vs remaining, local reset time) plus the active coupon. */
export function QuotaSection({ quota }: QuotaSectionProps) {
  if (!quota) {
    return <p className="text-[11px] text-ink/50">Quota data is not available for this account.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink/40">
          Quota windows
        </h4>
        {quota.planName && (
          <span className="text-[10px] text-ink/60">
            Plan <span className="font-semibold text-ink">{quota.planName}</span>
          </span>
        )}
      </div>

      {quota.windows.length === 0 ? (
        <p className="text-[11px] text-ink/50">No quota windows reported.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {quota.windows.map((window) => (
            <QuotaWindowRow key={window.key} window={window} />
          ))}
        </div>
      )}

      {quota.coupon && <CouponBlock coupon={quota.coupon} />}
    </div>
  );
}
