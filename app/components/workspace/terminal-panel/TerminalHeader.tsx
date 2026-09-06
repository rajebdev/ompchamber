import React from 'react';
import { Terminal, Trash2, Folder, Loader2 } from 'lucide-react';

interface TerminalHeaderProps {
  cwd: string;
  isRunning: boolean;
  bunVersion: string;
  onClear: () => void;
  onClose?: () => void;
}

export function TerminalHeader({
  cwd,
  isRunning,
  bunVersion,
  onClear,
  onClose,
}: TerminalHeaderProps) {
  return (
    <div className="h-10 px-3 border-b border-[#141310]/10 bg-[#faf8f3] flex items-center justify-between flex-shrink-0 select-none">
      <div className="flex items-center space-x-2 min-w-0">
        <Terminal size={14} className="text-[#141310]/70 flex-shrink-0" />
        <span className="text-xs font-semibold tracking-tight text-[#141310] uppercase">
          Terminal
        </span>
        
        {/* Runtime Badge */}
        <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#141310]/5 text-[#141310]/60 border border-[#141310]/10">
          bun v{bunVersion}
        </span>

        {/* Current working directory pill */}
        <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#141310]/5 text-[#141310]/70 border border-[#141310]/10 truncate max-w-[140px] sm:max-w-[180px]">
          <Folder size={10} className="text-[#141310]/50 flex-shrink-0" />
          <span className="truncate">~/{cwd === '.' ? '' : cwd}</span>
        </div>

        {isRunning && (
          <span className="inline-flex items-center space-x-1 text-[10px] font-mono text-amber-600 animate-pulse">
            <Loader2 size={11} className="animate-spin" />
            <span className="hidden xs:inline">Running</span>
          </span>
        )}
      </div>

      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={onClear}
          title="Clear Terminal (Ctrl+L)"
          className="p-1.5 rounded hover:bg-[#141310]/5 text-[#141310]/60 hover:text-[#141310] transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
