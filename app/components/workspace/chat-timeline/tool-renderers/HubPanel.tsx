import { useMemo } from 'react';
import { Radio, Server, CheckCircle2, Play, Activity } from 'lucide-react';
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

/** Panel untuk tool `hub` — proses background, dev servers, atau job list. */
export function HubPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: HubItem[] = Array.isArray(details.items) ? details.items : [];
  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;
  const output = tool.output || '';

  // Detect process management mode (e.g. op: "start", name: "ompchamber", application: "bun")
  const processInfo = useMemo(() => {
    if (!inputObj?.op && !output.includes('pid=')) return null;

    const op = inputObj?.op || 'process';
    const name = inputObj?.name || 'Service';
    const app = inputObj?.application;
    const args = Array.isArray(inputObj?.args) ? inputObj.args.join(' ') : '';
    const cmd = app ? `${app} ${args}`.trim() : args;
    const port = inputObj?.ready?.port;

    const pidMatch = output.match(/pid=(\d+)/i);
    const uptimeMatch = output.match(/uptime=([^\s]+)/i);
    const restartsMatch = output.match(/restarts=(\d+)/i);
    const isReady = output.toLowerCase().includes('ready') || output.toLowerCase().includes('started');

    return {
      op,
      name,
      cmd,
      port,
      pid: pidMatch ? pidMatch[1] : undefined,
      uptime: uptimeMatch ? uptimeMatch[1] : undefined,
      restarts: restartsMatch ? restartsMatch[1] : undefined,
      isReady,
      outputLines: output.split(/\r?\n/).filter(Boolean),
    };
  }, [inputObj, output]);

  // If process start/stop
  if (processInfo) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <Server size={13} className="text-ink/60" />
              <span className="font-mono text-[11px] font-semibold text-ink">{processInfo.name}</span>
              <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9.5px] uppercase tracking-wider text-ink/50">
                {processInfo.op}
              </span>
            </div>

            {processInfo.isReady && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Active
              </span>
            )}
          </div>

          <div className="divide-y divide-ink/[0.04] p-3 text-[11px]">
            {processInfo.cmd && (
              <div className="flex items-center justify-between py-1 font-mono">
                <span className="text-ink/45">Command</span>
                <span className="rounded bg-ink/5 px-2 py-0.5 text-ink/85">{processInfo.cmd}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 py-1.5 font-mono text-[10.5px]">
              {processInfo.port && (
                <span className="text-ink/60">
                  Port: <strong className="text-ink">{processInfo.port}</strong>
                </span>
              )}
              {processInfo.pid && (
                <span className="text-ink/60">
                  PID: <strong className="text-ink">{processInfo.pid}</strong>
                </span>
              )}
              {processInfo.uptime && (
                <span className="text-ink/60">
                  Uptime: <strong className="text-ink">{processInfo.uptime}</strong>
                </span>
              )}
            </div>

            {processInfo.outputLines.length > 0 && (
              <div className="pt-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-ink/40">Log Output</span>
                <div className="mt-1 rounded border border-ink/6 bg-canvas/40 p-2 font-mono text-[10.5px] text-ink/75">
                  {processInfo.outputLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Job List mode
  if (items.length === 0) {
    const lines = output.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          <Activity size={13} className="shrink-0" />
          <span>No hub activities</span>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-ink/8 bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink/80">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-3 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Hub Jobs</span>
        <span className="rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const status = itemStatus(item);
          const name = typeof item.name === 'string' ? item.name : typeof item.id === 'string' ? item.id : `job-${index}`;
          const task = typeof item.task === 'string' ? item.task : typeof item.message === 'string' ? item.message : '';
          return (
            <div key={index} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]">
              {status === 'running' ? (
                <Radio size={11} className="shrink-0 animate-pulse text-ink/50" />
              ) : status === 'done' ? (
                <CheckCircle2 size={11} className="shrink-0 text-success" />
              ) : (
                <Play size={11} className="shrink-0 text-ink/40" />
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
