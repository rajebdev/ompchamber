import type { ChartMetric, ChartSeriesPoint } from '@/shared/types';

interface UsageChartProps {
  cadence: string;
  metric: ChartMetric;
  series: ChartSeriesPoint[];
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function buildPath(series: ChartSeriesPoint[], values: number[], max: number): string {
  if (series.length === 0) return '';
  if (series.length === 1) return 'M0,98 L100,98';
  const span = max > 0 ? max : 1;
  return series
    .map((_, index) => {
      const x = (index / (series.length - 1)) * 100;
      const y = 98 - (values[index] / span) * 94;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function UsageChart({ cadence, metric, series }: UsageChartProps) {
  const values = series.map((p) => (metric === 'cost' ? p.cost : p.tokens));
  const max = values.length > 0 ? Math.max(...values) : 0;
  const path = buildPath(series, values, max);
  const axisMax = metric === 'cost' ? formatCost(max) : formatTokens(max);
  const axisMid = metric === 'cost' ? formatCost(max / 2) : formatTokens(max / 2);
  const first = series[0]?.label ?? '';
  const mid = series.length > 2 ? series[Math.floor(series.length / 2)]?.label ?? '' : '';
  const last = series.length > 1 ? series[series.length - 1]?.label ?? '' : '';

  if (series.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-[11px] text-ink/40">
        No usage data in this period
      </div>
    );
  }

  return (
    <div className="h-28 relative">
      <div className="absolute inset-0 flex flex-col justify-between pt-1 pb-4">
        <div className="border-t border-ink/5 w-full border-dashed"></div>
        <div className="border-t border-ink/5 w-full border-dashed"></div>
        <div className="border-t border-ink/15 w-full"></div>
      </div>
      <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[9px] font-mono text-ink/40 w-9">
        <span>{axisMax}</span>
        <span>{axisMid}</span>
        <span>0</span>
      </div>
      <div className="absolute left-10 right-0 bottom-4 top-0 flex items-end">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            className="text-ink/60 transition-all duration-300"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="absolute left-10 right-0 bottom-0 h-4 flex justify-between text-[9px] text-ink/40 items-end">
        <span>{first}</span>
        {mid && <span>{mid}</span>}
        <span>{last}</span>
      </div>
      <span className="sr-only">{`${cadence} ${metric} trend`}</span>
    </div>
  );
}
