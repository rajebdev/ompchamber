import { useState } from 'react';
import { Terminal, Trash2, Folder, Loader2, Sun, Moon, Copy, Check } from 'lucide-react';
import { GitRepoDropdown } from '@/components/workspace/file-explorer/GitRepoDropdown';
import { getTerminalSessionOutput } from '@/data/terminalTheme';

interface TerminalHeaderProps {
  cwd: string;
  rootName?: string;
  isRunning: boolean;
  bunVersion: string;
  onClear: () => void;
  rootPath?: string;
  activeRepo: string;
  onSelectRepo: (repo: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
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
  isDark,
  onToggleTheme,
}: TerminalHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyBuffer = () => {
    const text = getTerminalSessionOutput();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="h-10 px-3 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none">
      {/* Left cluster: Title, Status, Repo, CWD */}
      <div className="flex items-center space-x-2 min-w-0">
        <div className="flex items-center space-x-1.5">
          <Terminal size={14} className="text-ink/80 flex-shrink-0" />
          <span className="text-xs font-semibold tracking-wider text-ink uppercase">
            Terminal
          </span>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center">
          {isRunning ? (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-warning/10 text-warning border border-warning/20 animate-pulse">
              <Loader2 size={10} className="animate-spin" />
              <span className="hidden xs:inline">RUNNING</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-success-bg text-success border border-success-border">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block"></span>
              <span className="hidden xs:inline">READY</span>
            </span>
          )}
        </div>

        <GitRepoDropdown rootPath={rootPath} activeRepo={activeRepo} onSelectRepo={onSelectRepo} />

        {/* Runtime Badge */}
        <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 text-ink/60 border border-ink/10">
          bun v{bunVersion}
        </span>

        {/* Current working directory pill */}
        <div className="hidden sm:flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 text-ink/70 border border-ink/10 truncate max-w-[130px] md:max-w-[170px]">
          <Folder size={10} className="text-ink/50 flex-shrink-0" />
          <span className="truncate">{rootName || '~'}/{cwd === '.' ? '' : cwd}</span>
        </div>
      </div>

      {/* Right cluster: Theme Toggle, Copy Output, Clear */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        {/* Quick Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Theme (E-Ink Paper)' : 'Switch to Dark Theme (One Dark)'}
          className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono border border-ink/15 hover:border-ink/30 bg-canvas hover:bg-ink/5 text-ink transition-colors cursor-pointer"
        >
          {isDark ? (
            <>
              <Sun size={12} className="text-amber-400" />
              <span className="hidden sm:inline">Dark</span>
            </>
          ) : (
            <>
              <Moon size={12} className="text-ink/70" />
              <span className="hidden sm:inline">Light</span>
            </>
          )}
        </button>

        {/* Copy buffer */}
        <button
          type="button"
          onClick={handleCopyBuffer}
          title="Copy terminal session output"
          className="p-1.5 rounded hover:bg-ink/5 text-ink/60 hover:text-ink transition-colors cursor-pointer"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>

        {/* Clear terminal */}
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
