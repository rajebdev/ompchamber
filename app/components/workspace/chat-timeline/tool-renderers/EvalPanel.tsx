import type { ToolCallData } from '@/types';

/** Panel untuk tool `eval` — code + output. */
export function EvalPanel({ tool }: { tool: ToolCallData }) {
  const input = tool.input;
  const code =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object'
        ? (typeof input.code === 'string' ? input.code : JSON.stringify(input, null, 2))
        : '';

  return (
    <div className="space-y-2">
      {code && (
        <div className="space-y-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Code</div>
          <pre className="max-h-40 overflow-auto whitespace-pre overflow-x-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink/80 select-text">
            {code}
          </pre>
        </div>
      )}
      {tool.output && (
        <div className="space-y-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Output</div>
          <pre className="max-h-40 overflow-auto whitespace-pre overflow-x-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink/80 select-text">
            {tool.output}
          </pre>
        </div>
      )}
    </div>
  );
}
