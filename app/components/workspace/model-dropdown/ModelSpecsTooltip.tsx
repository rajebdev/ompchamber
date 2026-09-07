import React from 'react';
import type { AIModelOption } from '@/types';

interface ModelSpecsTooltipProps {
  model: AIModelOption | null;
  position?: { top: number; left?: number; right?: number };
}

export function ModelSpecsTooltip({ model }: ModelSpecsTooltipProps) {
  if (!model) return null;

  const capabilities = model.capabilities && model.capabilities.length > 0 
    ? model.capabilities.join(', ') 
    : 'Tool calling, Reasoning';

  const inputFormat = model.input || 'text';
  const outputFormat = model.output || 'text';
  const cost = model.cost 
    ? `In ${model.cost.input} · Out ${model.cost.output}` 
    : 'In $0.14 · Out $0.28';

  return (
    <div 
      className="w-72 bg-paper/95 backdrop-blur-sm border border-ink/20 rounded-xl shadow-2xl p-3.5 text-xs text-ink select-none animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="space-y-2.5 font-mono text-[11px]">
        {/* Capabilities */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-ink/50 font-sans text-xs">Capabilities</span>
          <span className="text-ink font-medium text-right text-xs font-sans">
            {capabilities}
          </span>
        </div>

        {/* Input */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink/50 font-sans text-xs">Input</span>
          <span className="text-ink/80">{inputFormat}</span>
        </div>

        {/* Output */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink/50 font-sans text-xs">Output</span>
          <span className="text-ink/80">{outputFormat}</span>
        </div>

        {/* Cost */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-ink/10">
          <span className="text-ink/50 font-sans text-xs">Cost ($/1M tokens)</span>
          <span className="text-ink font-semibold tracking-tight">{cost}</span>
        </div>

        {/* Optional Description / Model ID */}
        {model.description && (
          <div className="pt-1.5 text-[10px] text-ink/60 font-sans leading-relaxed border-t border-ink/5">
            {model.description}
          </div>
        )}
      </div>
    </div>
  );
}
