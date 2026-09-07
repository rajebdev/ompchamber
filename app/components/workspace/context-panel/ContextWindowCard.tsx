import React from 'react';

interface ContextWindowCardProps {
  used: number;
  limit: number;
  percent: number;
}

export function ContextWindowCard({ used, limit, percent }: ContextWindowCardProps) {
  const formattedUsed = used.toLocaleString();
  const formattedLimit = limit.toLocaleString();
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="bg-canvas border border-ink/10 rounded-xl p-4 transition-all">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-semibold text-ink/80">Context</span>
        <span className="font-mono text-ink/70 text-[11px]">
          {formattedUsed} / {formattedLimit}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-ink/10 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-ink/70 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>

      <div className="text-[11px] font-mono text-ink/50 text-left">
        {clampedPercent.toFixed(1)}% used
      </div>
    </div>
  );
}
