import type { AIModelOption } from '@/shared/types';
import { formatContextWindow } from '@/shared/lib/code/format';

interface ModelSpecsTooltipProps {
  model: AIModelOption | null;
  position?: { top: number; left?: number; right?: number };
}

export function ModelSpecsTooltip({ model }: ModelSpecsTooltipProps) {
  if (!model) return null;

  return (
    <div 
      className="w-72 bg-paper/95 backdrop-blur-sm border border-ink/20 rounded-xl shadow-2xl p-3.5 text-xs text-ink select-none animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="space-y-2.5 font-mono text-[11px]">
        {/* Capabilities */}
        {model.capabilities && model.capabilities.length > 0 && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-ink/50 font-sans text-xs">Capabilities</span>
            <span className="text-ink font-medium text-right text-xs font-sans">
              {model.capabilities.join(', ')}
            </span>
          </div>
        )}

        {/* Context window */}
        {model.contextWindow && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink/50 font-sans text-xs">Context</span>
            <span className="text-ink/80">{formatContextWindow(model.contextWindow)}</span>
          </div>
        )}

        {/* Thinking level */}
        {model.thinkingLevel && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink/50 font-sans text-xs">Thinking</span>
            <span className="text-ink/80">{model.thinkingLevel}</span>
          </div>
        )}

        {/* Input */}
        {model.input && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink/50 font-sans text-xs">Input</span>
            <span className="text-ink/80">{model.input}</span>
          </div>
        )}

        {/* Output */}
        {model.output && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink/50 font-sans text-xs">Output</span>
            <span className="text-ink/80">{model.output}</span>
          </div>
        )}

        {/* Cost — only shown when real cost data exists */}
        {model.cost && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-ink/10">
            <span className="text-ink/50 font-sans text-xs">Cost ($/1M tokens)</span>
            <span className="text-ink font-semibold tracking-tight">
              In {model.cost.input} · Out {model.cost.output}
            </span>
          </div>
        )}
        {/* Cache cost — only when cache pricing exists */}
        {(model.cost?.cacheRead !== undefined || model.cost?.cacheWrite !== undefined) && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-ink/5">
            <span className="text-ink/50 font-sans text-xs">Cache</span>
            <span className="text-ink/80">
              {model.cost?.cacheRead !== undefined && model.cost?.cacheWrite !== undefined
                ? `Read ${model.cost.cacheRead} · Write ${model.cost.cacheWrite}`
                : model.cost?.cacheRead !== undefined
                  ? `Read ${model.cost.cacheRead}`
                  : `Write ${model.cost.cacheWrite}`}
            </span>
          </div>
        )}

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
