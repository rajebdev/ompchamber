import { useMemo } from 'react';
import { CheckCircle2, Loader2, XCircle, Ban } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface TaskRow {
  id?: unknown;
  agent?: unknown;
  status?: unknown;
  task?: unknown;
  assignment?: unknown;
  exitCode?: unknown;
  error?: unknown;
  aborted?: unknown;
  tokens?: unknown;
  cost?: unknown;
  durationMs?: unknown;
  resolvedModel?: unknown;
}

function rowStatus(row: TaskRow): 'running' | 'done' | 'failed' | 'aborted' {
  if (row.aborted === true) return 'aborted';
  if (typeof row.error === 'string' && row.error) return 'failed';
  if (typeof row.exitCode === 'number') return row.exitCode === 0 ? 'done' : 'failed';
  if (row.status === 'done' || row.status === 'completed' || row.status === 'success') return 'done';
  if (row.status === 'failed') return 'failed';
  if (row.status === 'aborted') return 'aborted';
  return 'running';
}

const STATUS_STYLES = {
  running: { icon: <Loader2 size={11} className="animate-spin text-ink/50" />, label: 'running' },
  done: { icon: <CheckCircle2 size={11} className="text-success" />, label: 'done' },
  failed: { icon: <XCircle size={11} className="text-error" />, label: 'failed' },
  aborted: { icon: <Ban size={11} className="text-ink/35" />, label: 'aborted' },
} as const;

function formatToken(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
}

function formatCost(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return `$${n.toFixed(3)}`;
}

function formatMs(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1000) return '';
  return `${Math.floor(n / 1000)}s`;
}

/** Ringkasan per-subagent dari tool `task` — details.results[] / progress[]. */
export function TaskResultPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const results = Array.isArray(details.results) ? (details.results as TaskRow[]) : [];
  const progress = Array.isArray(details.progress) ? (details.progress as TaskRow[]) : [];
  const rows = useMemo(() => (results.length > 0 ? results : progress), [results, progress]);

  if (rows.length === 0) return null;

  const totalTokens = rows.reduce((sum, r) => sum + (typeof r.tokens === 'number' ? r.tokens : 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (typeof r.cost === 'number' ? r.cost : 0), 0);

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          Subagents
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink/45">
          {rows.length} {rows.length > 1 ? 'runs' : 'run'}
          {totalTokens ? ` · ${formatToken(totalTokens)} tok` : ''}
          {totalCost ? ` · ${formatCost(totalCost)}` : ''}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 px-2.5 py-1">
        {rows.map((row, index) => {
          const status = rowStatus(row);
          const style = STATUS_STYLES[status];
          const label =
            typeof row.task === 'string' && row.task
              ? row.task
              : typeof row.assignment === 'string' && row.assignment
                ? row.assignment
                : null;
          const right = [
            formatToken(row.tokens),
            formatCost(row.cost),
            status !== 'running' ? formatMs(row.durationMs) : '',
          ].filter(Boolean).join(' · ');
          return (
            <div key={typeof row.id === 'string' ? row.id : `row-${index}`} className="flex items-center gap-2 py-1.5 text-[11.5px]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink/[0.04]">
                {style.icon}
              </span>
              <span className="shrink-0 font-mono text-[10px] font-semibold text-ink/70">
                {typeof row.agent === 'string' ? row.agent : 'subagent'}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink/80">{label ?? ''}</span>
              {right && <span className="shrink-0 font-mono text-[9.5px] text-ink/40">{right}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
