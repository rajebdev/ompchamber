import type { ToolCallData } from '@/types';

interface BashMeta {
  exitCode?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  truncated?: unknown;
}

/** Panel untuk tool `bash` / `terminal` — command + exit code + output. */
export function BashPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const meta = details as BashMeta;
  const command = tool.command || (typeof tool.input === 'string' ? tool.input : '');
  const output = tool.output || (tool.error ? `Error: ${tool.error}` : '');
  const exitCode = typeof meta.exitCode === 'number' ? meta.exitCode : tool.isError ? 1 : undefined;
  const cwd = typeof meta.cwd === 'string' ? meta.cwd : undefined;

  return (
    <div className="space-y-2">
      {command && (
        <div className="flex items-start gap-2.5 overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <span className="mt-2.5 ml-3 select-none font-bold text-warning">$</span>
          <pre className="flex-1 overflow-x-auto px-2 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink/80 select-text">
            {command}
          </pre>
          {exitCode !== undefined && (
            <span
              className={`mt-2 mr-2.5 shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                exitCode === 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      )}

      {cwd && (
        <div className="truncate font-mono text-[9.5px] text-ink/40">cwd: {cwd}</div>
      )}

      {output && (
        <div className="space-y-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Output</div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/80 select-text">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
