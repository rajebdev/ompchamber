import { StatCard } from '@/components/workspace/context-panel/StatCard';

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
        <StatCard label="In" value={input.toLocaleString()} />
        <StatCard label="Out" value={output.toLocaleString()} />
        <StatCard label="Reason" value={reasoning.toLocaleString()} />
        <StatCard label="Cache" value={`${cacheRead.toLocaleString()}/${cacheWrite.toLocaleString()}`} />
        <StatCard label="Hit" value={`${cacheHitPercent.toFixed(1)}%`} />
      </div>
    </>
  );
}
