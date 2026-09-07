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
    <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar px-3 py-1.5 bg-paper border-b border-ink/10 flex-shrink-0">
      <span className="text-[10px] font-mono text-ink/40 uppercase tracking-wider flex-shrink-0 mr-1 select-none">
        Quick:
      </span>
      {PRESET_COMMANDS.map(item => (
        <button
          key={item.cmd}
          type="button"
          disabled={disabled}
          onClick={() => onSelectCommand(item.cmd)}
          className="px-2 py-0.5 rounded text-[10px] font-mono bg-ink/5 hover:bg-ink/10 text-ink/80 hover:text-ink border border-ink/10 transition-colors whitespace-nowrap disabled:opacity-40 cursor-pointer"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
