import { Loader2, Terminal } from 'lucide-preact';
import { GitRepoDropdown } from '@/client/components/workspace/file-explorer/GitRepoDropdown';

interface TerminalHeaderProps {
  isRunning: boolean;
  rootPath?: string;
  activeRepo: string;
  onSelectRepo: (repo: string) => void;
}

export function TerminalHeader({
  isRunning,
  rootPath,
  activeRepo,
  onSelectRepo,
}: TerminalHeaderProps) {
  return (
    <div className="h-10 px-3 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none">
      {/* Left cluster: Title, Status, Repo */}
      <div className="flex items-center space-x-2 min-w-0">
        <div className="flex items-center space-x-1.5">
          <Terminal size={14} className="text-ink/80 flex-shrink-0" />
          <span className="text-xs font-semibold tracking-wider text-ink uppercase">
            Terminal
          </span>
        </div>

        {isRunning && (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-warning/10 text-warning border border-warning/20 animate-pulse">
            <Loader2 size={10} className="animate-spin" />
            <span className="hidden xs:inline">RUNNING</span>
          </span>
        )}

        <GitRepoDropdown rootPath={rootPath} activeRepo={activeRepo} onSelectRepo={onSelectRepo} />
      </div>
    </div>
  );
}
