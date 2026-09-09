
import { Zap } from 'lucide-react';

interface TerminalQuickActionsProps {
  onSelectCommand: (cmd: string) => void;
  disabled?: boolean;
}

const PRESET_COMMANDS = [
  { label: 'bun build', cmd: 'bun run build' },
  { label: 'bun test', cmd: 'bun test' },
  { label: 'git status', cmd: 'git status -s' },
  { label: 'git diff', cmd: 'git diff' },
  { label: 'ls -la', cmd: 'ls -la' },
  { label: 'pwd', cmd: 'pwd' },
  { label: 'bun -v', cmd: 'bun --version' },
];

export function TerminalQuickActions({ onSelectCommand, disabled }: TerminalQuickActionsProps) {
  return (
    <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar px-3 py-1.5 bg-paper border-b border-ink/10 flex-shrink-0">
      <div className="flex items-center space-x-1 text-[10px] font-mono text-ink/50 uppercase tracking-wider flex-shrink-0 mr-1 select-none">
        <Zap size={11} className="text-warning" />
        <span>Quick:</span>
      </div>
      {PRESET_COMMANDS.map(item => (
        <button
          key={item.cmd}
          type="button"
          disabled={disabled}
          onClick={() => onSelectCommand(item.cmd)}
          className="px-2 py-0.5 rounded text-[10px] font-mono bg-canvas hover:bg-ink/5 active:bg-ink/10 text-ink/80 hover:text-ink border border-ink/15 transition-all whitespace-nowrap disabled:opacity-40 cursor-pointer shadow-2xs"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
