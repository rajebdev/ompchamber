import React from 'react';
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
      <div className="flex items-center justify-between text-[#f4f1ea]/90 bg-[#141310]/40 px-2 py-0.5 rounded border border-[#f4f1ea]/5">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-amber-400 font-bold select-none">$</span>
          <span className="font-semibold text-amber-200 truncate">{item.command}</span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-[#f4f1ea]/50 flex-shrink-0 ml-2 select-none">
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
                <span className="flex items-center text-emerald-400" title="Exit code: 0">
                  <Check size={11} />
                </span>
              )}
              {isError && (
                <span
                  className="flex items-center space-x-0.5 text-[#c8321e] font-bold"
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
        <pre className="text-[#f4f1ea]/85 whitespace-pre-wrap break-all px-2 py-0.5 overflow-x-auto selection:bg-[#f4f1ea]/20">
          {item.stdout}
        </pre>
      )}

      {/* Stderr block in signal red */}
      {item.stderr && (
        <pre className="text-[#c8321e] font-medium whitespace-pre-wrap break-all px-2 py-0.5 bg-[#c8321e]/10 rounded border border-[#c8321e]/20 selection:bg-[#c8321e]/30">
          {item.stderr}
        </pre>
      )}
    </div>
  );
}
