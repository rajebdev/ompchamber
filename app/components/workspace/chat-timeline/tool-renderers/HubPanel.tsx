import { Radio, MessageSquare, ListTodo, Inbox } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface HubItem {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  state?: unknown;
  task?: unknown;
  message?: unknown;
}

function itemStatus(item: HubItem): 'running' | 'done' | 'failed' | 'idle' {
  const s = typeof item.status === 'string' ? item.status.toLowerCase() : typeof item.state === 'string' ? item.state.toLowerCase() : '';
  if (s === 'running' || s === 'started') return 'running';
  if (s === 'done' || s === 'completed' || s === 'success') return 'done';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'idle';
}

const STATUS_STYLES = {
  running: 'bg-ink/8 text-ink/60',
  done: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
  idle: 'bg-ink/5 text-ink/45',
} as const;

function countByStatus(items: HubItem[]): Record<string, number> {
  const counts: Record<string, number> = { running: 0, done: 0, failed: 0, idle: 0 };
  for (const item of items) counts[itemStatus(item)]++;
  return counts;
}

/** Panel untuk tool `hub` — job list + ringkasan status. */
export function HubPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: HubItem[] = Array.isArray(details.items) ? details.items : [];

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          <Inbox size={13} className="shrink-0" />
          <span>No jobs</span>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
        {lines.map((line, i) => (
          <li key={i} className="px-2.5 py-1.5 font-mono text-[11px] break-words text-ink/75">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  const counts = countByStatus(items);

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Jobs</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px]">
          {counts.running > 0 && <span className="rounded-full bg-ink/8 px-1.5 py-px text-ink/60">{counts.running} run</span>}
          {counts.done > 0 && <span className="rounded-full bg-success/10 px-1.5 py-px text-success">{counts.done} done</span>}
          {counts.failed > 0 && <span className="rounded-full bg-error/10 px-1.5 py-px text-error">{counts.failed} fail</span>}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const status = itemStatus(item);
          const name = typeof item.name === 'string' ? item.name : typeof item.id === 'string' ? item.id : `job-${index}`;
          const task = typeof item.task === 'string' ? item.task : typeof item.message === 'string' ? item.message : '';
          return (
            <div key={typeof item.id === 'string' ? item.id : `job-${index}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
              {status === 'running' ? (
                <Radio size={11} className="shrink-0 animate-pulse text-ink/50" />
              ) : status === 'done' ? (
                <MessageSquare size={11} className="shrink-0 text-success" />
              ) : (
                <ListTodo size={11} className="shrink-0 text-ink/40" />
              )}
              <span className="shrink-0 font-mono text-[10px] font-semibold text-ink/70">{name}</span>
              <span className="min-w-0 flex-1 truncate text-ink/80">{task}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] ${STATUS_STYLES[status]}`}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
