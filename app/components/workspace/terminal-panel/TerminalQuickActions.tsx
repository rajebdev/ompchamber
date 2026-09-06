import React from 'react';

interface TerminalQuickActionsProps {
  onSelectCommand: (cmd: string) => void;
  disabled?: boolean;
}

const PRESET_COMMANDS = [
  { label: 'bun -v', cmd: 'bun --version' },
  { label: 'bun build', cmd: 'bun run build' },
  { label: 'git status', cmd: 'git status -s' },
  { label: 'git branch', cmd: 'git branch' },
  { label: 'ls -la', cmd: 'ls -la' },
  { label: 'pwd', cmd: 'pwd' },
];

export function TerminalQuickActions({ onSelectCommand, disabled }: TerminalQuickActionsProps) {
  return (
    <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar px-3 py-1.5 bg-[#faf8f3] border-b border-[#141310]/10 flex-shrink-0">
      <span className="text-[10px] font-mono text-[#141310]/40 uppercase tracking-wider flex-shrink-0 mr-1 select-none">
        Quick:
      </span>
      {PRESET_COMMANDS.map(item => (
        <button
          key={item.cmd}
          type="button"
          disabled={disabled}
          onClick={() => onSelectCommand(item.cmd)}
          className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#141310]/5 hover:bg-[#141310]/10 text-[#141310]/80 hover:text-[#141310] border border-[#141310]/10 transition-colors whitespace-nowrap disabled:opacity-40 cursor-pointer"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
