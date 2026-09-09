import { CheckSquare, Square } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface TodoItem {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  completed?: unknown;
  id?: unknown;
}

function isChecked(item: TodoItem): boolean {
  if (item.completed === true) return true;
  return item.status === 'done' || item.status === 'completed';
}

function itemLabel(item: TodoItem): string {
  if (typeof item.title === 'string' && item.title) return item.title;
  return typeof item.description === 'string' ? item.description : '';
}

/** Checklist renderer untuk tool `todo` — parse dari details atau output. */
export function TodoPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: TodoItem[] = Array.isArray(details.items) ? details.items : [];

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
    return (
      <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px] text-ink/80">
            <Square size={11} className="mt-0.5 shrink-0 text-ink/30" />
            <span className="min-w-0 flex-1 break-words">{line}</span>
          </li>
        ))}
      </ul>
    );
  }

  const done = items.filter(isChecked).length;
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="border-b border-ink/8 bg-paper px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Todo</span>
          <span className="ml-auto font-mono text-[10px] text-ink/45">
            {done}/{items.length}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/8">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 px-2.5 py-1">
        {items.map((item, index) => {
          const label = itemLabel(item);
          if (!label) return null;
          const checked = isChecked(item);
          return (
            <div key={typeof item.id === 'string' ? item.id : `todo-${index}`} className="flex items-start gap-2 py-1.5 text-[11.5px]">
              {checked ? (
                <CheckSquare size={12} className="mt-0.5 shrink-0 text-success" />
              ) : (
                <Square size={12} className="mt-0.5 shrink-0 text-ink/30" />
              )}
              <span className={`min-w-0 flex-1 break-words ${checked ? 'text-ink/40 line-through' : 'text-ink/80'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
