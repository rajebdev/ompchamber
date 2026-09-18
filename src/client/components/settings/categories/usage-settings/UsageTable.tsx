import type { KenariUsage } from '@/shared/types';
import { formatCompactTokens, formatNumber, formatRp } from '@/client/components/settings/categories/usage-settings/format';

interface UsageTableProps {
  usage?: KenariUsage;
}

/** 30-day kenari usage per model, with a totals footer. */
export function UsageTable({ usage }: UsageTableProps) {
  if (!usage) {
    return <p className="text-[11px] text-ink/50">The 30-day usage report is not available.</p>;
  }

  const totalInput = usage.rows.reduce((sum, row) => sum + row.inputTokens, 0);
  const totalOutput = usage.rows.reduce((sum, row) => sum + row.outputTokens, 0);

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink/40">
        30-day usage by model
      </h4>

      <div className="overflow-x-auto border border-ink/15 rounded-lg shadow-xs">
        <table className="w-full text-[11px]">
          <thead className="bg-ink/5 text-ink/60">
            <tr>
              <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Model</th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Requests</th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Input tokens</th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Output tokens</th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {usage.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-ink/50">
                  No usage recorded in the last 30 days.
                </td>
              </tr>
            ) : (
              usage.rows.map((row) => (
                <tr key={row.model}>
                  <td className="px-3 py-1.5 font-mono text-ink whitespace-nowrap">{row.model}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink/80">{formatNumber(row.requests)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink/80">{formatCompactTokens(row.inputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink/80">{formatCompactTokens(row.outputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink/80">{formatRp(row.costRp)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-ink/5 border-t border-ink/15 font-semibold text-ink">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(usage.totalRequests)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCompactTokens(totalInput)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCompactTokens(totalOutput)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRp(usage.totalCostRp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
