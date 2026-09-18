import type { TokenUsageMetricSet } from '@/shared/types';

interface TokenUsageMetricsGridProps {
  activeMetrics: TokenUsageMetricSet;
}

export function TokenUsageMetricsGrid({ activeMetrics }: TokenUsageMetricsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-stretch">
      <div className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs flex flex-col justify-between h-full">
        <div>
          <div className="text-base font-bold tracking-tight text-ink leading-tight">{activeMetrics.processedTokens}</div>
          <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
            Processed tokens
          </div>
        </div>
        <div className="text-[10px] text-ink/50 mt-1.5 leading-tight">
          {activeMetrics.activeRate}
        </div>
      </div>

      <div className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs flex flex-col justify-between h-full">
        <div>
          <div className="text-base font-bold tracking-tight text-ink leading-tight">{activeMetrics.cachedInput}</div>
          <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
            Cached input
          </div>
        </div>
        <div className="text-[10px] text-ink/50 mt-1.5 leading-tight">
          {activeMetrics.cachedPercent}
        </div>
      </div>

      <div className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs flex flex-col justify-between h-full">
        <div>
          <div className="text-base font-bold tracking-tight text-ink leading-tight">{activeMetrics.uncachedInput}</div>
          <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
            Uncached input
          </div>
        </div>
        <div className="text-[10px] text-ink/50 mt-1.5 leading-tight">
          0 cache writes
        </div>
      </div>

      <div className="bg-paper border border-ink/15 rounded-lg p-3 shadow-xs flex flex-col justify-between h-full">
        <div>
          <div className="text-base font-bold tracking-tight text-ink leading-tight">{activeMetrics.outputTokens}</div>
          <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
            Output
          </div>
        </div>
        <div className="text-[10px] text-ink/50 mt-1.5 leading-tight">
          {activeMetrics.reasoning}
        </div>
      </div>

      <div className="bg-ink/5 border border-ink/10 rounded-lg p-3 shadow-xs flex flex-col justify-between h-full col-span-2 sm:col-span-1">
        <div>
          <div className="text-base font-bold tracking-tight text-ink leading-tight">{activeMetrics.cacheSavings}</div>
          <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
            Cache savings
          </div>
        </div>
        <div className="text-[10px] text-ink/50 mt-1.5 leading-tight">
          0.0x the raw token cost
        </div>
      </div>
    </div>
  );
}
