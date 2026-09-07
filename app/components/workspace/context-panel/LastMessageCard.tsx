import React from 'react';

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
    <div className="bg-canvas border border-ink/10 rounded-xl p-4 space-y-4">
      <div className="text-xs font-semibold text-ink/80">
        Last Assistant Message
      </div>

      {/* Row 1: Input, Output, Reasoning */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Input</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {input.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Output</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {output.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Reasoning</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {reasoning.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Row 2: Cache Read, Cache Write, Cache Hit */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-ink/5">
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Cache Read</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {cacheRead.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Cache Write</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {cacheWrite.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-ink/50 mb-1">Cache Hit</div>
          <div className="text-xs font-mono font-semibold text-ink">
            {cacheHitPercent.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
