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
      <div className="flex items-center justify-between text-canvas/90 bg-ink/40 px-2 py-0.5 rounded border border-canvas/5">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-amber-400 font-bold select-none">$</span>
          <span className="font-semibold text-amber-200 truncate">{item.command}</span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-canvas/50 flex-shrink-0 ml-2 select-none">
          {isRunning ? (
            <span className="flex items-center space-x-1 text-amber-300">
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
        <pre className="text-canvas/85 whitespace-pre-wrap break-all px-2 py-0.5 overflow-x-auto selection:bg-canvas/20">
          {item.stdout}
        </pre>
      )}

      {/* Stderr block in signal red */}
      {item.stderr && (
        <pre className="text-error font-medium whitespace-pre-wrap break-all px-2 py-0.5 bg-error/10 rounded border border-error/20 selection:bg-error/30">
          {item.stderr}
        </pre>
      )}
    </div>
  );
}
