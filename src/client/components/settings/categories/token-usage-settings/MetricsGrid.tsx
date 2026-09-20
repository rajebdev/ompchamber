import type { TokenUsageMetricSet } from '@/shared/types';
import { StatCard } from '@/client/components/common/StatCard';

interface TokenUsageMetricsGridProps {
  activeMetrics: TokenUsageMetricSet;
}

export function TokenUsageMetricsGrid({ activeMetrics }: TokenUsageMetricsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-stretch">
      <StatCard
        value={activeMetrics.processedTokens}
        label="Processed tokens"
        hint={activeMetrics.activeRate}
      />

      <StatCard
        value={activeMetrics.cachedInput}
        label="Cached input"
        hint={activeMetrics.cachedPercent}
      />

      <StatCard
        value={activeMetrics.uncachedInput}
        label="Uncached input"
        hint="0 cache writes"
      />

      <StatCard
        value={activeMetrics.outputTokens}
        label="Output"
        hint={activeMetrics.reasoning}
      />

      <StatCard
        value={activeMetrics.cacheSavings}
        label="Cache savings"
        hint="0.0x the raw token cost"
        tone="muted"
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}
