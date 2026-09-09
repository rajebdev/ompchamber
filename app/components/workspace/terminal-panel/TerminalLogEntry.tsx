import type { TerminalLogItem } from '@/types';
import { Check, X, Clock, Loader2 } from 'lucide-react';

interface TerminalLogEntryProps {
  item: TerminalLogItem;
}

export function TerminalLogEntry({ item }: TerminalLogEntryProps) {
  const isRunning = item.exitCode === -1;
  const isError = !isRunning && item.exitCode !== 0;
  const isSuccess = !isRunning && item.exitCode === 0;

  return (
    <div className="space-y-1 font-mono text-[11px] leading-relaxed select-text">
      {/* Command prompt line */}
      <div className="flex items-center justify-between text-ink bg-canvas px-2.5 py-1 rounded border border-ink/15">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-warning font-bold select-none">$</span>
          <span className="font-semibold text-ink truncate">{item.command}</span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-ink/50 flex-shrink-0 ml-2 select-none">
          {isRunning ? (
            <span className="flex items-center space-x-1 text-warning">
              <Loader2 size={10} className="animate-spin" />
              <span>executing...</span>
            </span>
          ) : (
            <>
              {typeof item.durationMs === 'number' && (
                <span className="flex items-center space-x-0.5">
                  <Clock size={9} />
                  <span>{item.durationMs}ms</span>
                </span>
              )}
              {isSuccess && (
                <span className="flex items-center text-success" title="Exit code: 0">
                  <Check size={11} />
                </span>
              )}
              {isError && (
                <span
                  className="flex items-center space-x-0.5 text-error font-bold"
                  title={`Exit code: ${item.exitCode}`}
                >
                  <X size={11} />
                  <span>{item.exitCode}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stdout block */}
      {item.stdout && (
        <pre className="text-ink/85 whitespace-pre-wrap break-all px-2.5 py-1 overflow-x-auto selection:bg-ink/15 bg-canvas/40 rounded">
          {item.stdout}
        </pre>
      )}

      {/* Stderr block in signal red */}
      {item.stderr && (
        <pre className="text-error font-medium whitespace-pre-wrap break-all px-2.5 py-1 bg-error/10 rounded border border-error/20 selection:bg-error/30">
          {item.stderr}
        </pre>
      )}
    </div>
  );
}
