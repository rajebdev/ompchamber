import { StatCard } from '@/client/components/common/StatCard';

interface LastMessageCardProps {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPercent: number;
}

export function LastMessageCard({
  input,
  output,
  reasoning,
  cacheRead,
  cacheWrite,
  cacheHitPercent
}: LastMessageCardProps) {
  return (
    <>
      <div className="mb-1.5">
        <span className="text-xs font-semibold text-ink/80">Last Assistant Message</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <StatCard variant="compact" label="In" value={input.toLocaleString()} />
        <StatCard variant="compact" label="Out" value={output.toLocaleString()} />
        <StatCard variant="compact" label="Reason" value={reasoning.toLocaleString()} />
        <StatCard variant="compact" label="Cache" value={`${cacheRead.toLocaleString()}/${cacheWrite.toLocaleString()}`} />
        <StatCard variant="compact" label="Hit" value={`${cacheHitPercent.toFixed(1)}%`} />
      </div>
    </>
  );
}
