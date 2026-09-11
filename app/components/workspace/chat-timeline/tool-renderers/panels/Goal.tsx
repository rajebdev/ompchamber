import { Flag, Hand, CircleDot, Target } from 'lucide-react';
import type { ToolCallData } from '@/types';
import { FallbackOutput } from '@/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';

interface GoalItem {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  progress?: unknown;
  id?: unknown;
}

function itemLabel(item: GoalItem): string {
  if (typeof item.title === 'string' && item.title) return item.title;
  return typeof item.description === 'string' ? item.description : '';
}

function itemProgress(item: GoalItem): number | undefined {
  return typeof item.progress === 'number' && Number.isFinite(item.progress) ? item.progress : undefined;
}

function itemStatus(item: GoalItem): 'active' | 'done' | 'paused' {
  const s = typeof item.status === 'string' ? item.status.toLowerCase() : '';
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'paused' || s === 'yielded') return 'paused';
  return 'active';
}

const STATUS_STYLES = {
  active: 'bg-ink/8 text-ink/60',
  done: 'bg-success/10 text-success',
  paused: 'bg-warning/10 text-warning',
} as const;

/** Panel untuk tool `goal` / `yield` — status goal + progress. */
export function Goal({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: GoalItem[] = Array.isArray(details.items) ? details.items : [];
  const isYield = tool.type === 'yield';

  if (items.length === 0) {
    if (!tool.output) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          <Target size={13} className="shrink-0" />
          <span>{isYield ? 'No yield' : 'No goals'}</span>
        </div>
      );
    }
    return <FallbackOutput text={tool.output} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          {isYield ? 'Yield' : 'Goals'}
        </span>
        <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const label = itemLabel(item);
          if (!label) return null;
          const progress = itemProgress(item);
          const status = itemStatus(item);
          return (
            <div key={typeof item.id === 'string' ? item.id : `goal-${index}`} className="px-2.5 py-1.5">
              <div className="flex items-start gap-2 text-[11.5px]">
                {isYield ? (
                  <Hand size={11} className="mt-0.5 shrink-0 text-ink/40" />
                ) : (
                  <Flag size={11} className="mt-0.5 shrink-0 text-ink/40" />
                )}
                <span className="min-w-0 flex-1 break-words text-ink/80">{label}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] ${STATUS_STYLES[status]}`}>
                  {status}
                </span>
              </div>
              {progress !== undefined && (
                <div className="mt-1.5 flex items-center gap-1.5 pl-[18px]">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
                    <div
                      className="h-full rounded-full bg-ink/60 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, Math.round(progress * 100)))}%` }}
                    />
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 font-mono text-[9px] text-ink/45">
                    <CircleDot size={8} />
                    {Math.round(progress * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
