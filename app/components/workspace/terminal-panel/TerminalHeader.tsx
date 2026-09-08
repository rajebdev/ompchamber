import { Terminal, Trash2, Folder, Loader2 } from 'lucide-react';
import { GitRepoDropdown } from '@/components/workspace/file-explorer/GitRepoDropdown';

interface TerminalHeaderProps {
  cwd: string;
  rootName?: string;
  isRunning: boolean;
  bunVersion: string;
  onClear: () => void;
  rootPath?: string;
  activeRepo: string;
  onSelectRepo: (repo: string) => void;
}

export function TerminalHeader({
  cwd,
  rootName,
  isRunning,
  bunVersion,
  onClear,
  rootPath,
  activeRepo,
  onSelectRepo,
}: TerminalHeaderProps) {
  return (
    <div className="h-10 px-3 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none">
      <div className="flex items-center space-x-2 min-w-0">
        <Terminal size={14} className="text-ink/70 flex-shrink-0" />
        <span className="text-xs font-semibold tracking-tight text-ink uppercase">
          Terminal
        </span>

        <GitRepoDropdown rootPath={rootPath} activeRepo={activeRepo} onSelectRepo={onSelectRepo} />
        
        {/* Runtime Badge */}
        <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 text-ink/60 border border-ink/10">
          bun v{bunVersion}
        </span>

        {/* Current working directory pill */}
        <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 text-ink/70 border border-ink/10 truncate max-w-[140px] sm:max-w-[180px]">
          <Folder size={10} className="text-ink/50 flex-shrink-0" />
          <span className="truncate">{rootName || '~'}/{cwd === '.' ? '' : cwd}</span>
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
          className="p-1.5 rounded hover:bg-ink/5 text-ink/60 hover:text-ink transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
