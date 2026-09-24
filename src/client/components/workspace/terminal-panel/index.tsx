import { useCallback, useRef } from 'preact/hooks';
import { useTerminal } from '@/client/hooks/workspace/terminal';
import { useRepoList, useRepoScope } from '@/client/hooks/workspace/repo-scope';
import { useTheme } from '@/client/hooks/ui/theme';
import { TerminalHeader } from '@/client/components/workspace/terminal-panel/Header';
import { TerminalQuickActions } from '@/client/components/workspace/terminal-panel/QuickActions';
import { RealtimeXtermView, type RealtimeXtermHandle } from '@/client/components/workspace/terminal-panel/RealtimeXtermView';

interface TerminalPanelProps {
  className?: string;
  enabled?: boolean;
  rootPath?: string;
  showHeader?: boolean;
}

const encoder = new TextEncoder();

export function TerminalPanel({ className = '', enabled = true, rootPath, showHeader = true }: TerminalPanelProps) {
  const xtermRef = useRef<RealtimeXtermHandle>(null);
  const { isDark } = useTheme();
  const { activeRepo, setActiveRepo } = useRepoScope(rootPath, 'terminal.activeRepo');
  const { repos, scanning: reposScanning, rescan: rescanRepos } = useRepoList(rootPath, enabled);
  const gridRef = useRef<{ cols: number; rows: number } | null>(null);

  const handleOutput = useCallback((bytes: Uint8Array) => {
    xtermRef.current?.write(bytes);
  }, []);

  const handleReplay = useCallback((bytes: Uint8Array, frame: { replayCols: number; replayRows: number }) => {
    xtermRef.current?.writeReplay(bytes, frame.replayCols, frame.replayRows);
  }, []);

  const handleRestart = useCallback(() => {
    xtermRef.current?.reset();
  }, []);

  const {
    status,
    cwd,
    shell,
    exitCode,
    error,
    systemInfo,
    attach,
    resize,
    input,
    restart,
  } = useTerminal({
    root: enabled ? rootPath : undefined,
    repo: activeRepo,
    theme: isDark ? 'dark' : 'light',
    onOutput: handleOutput,
    onReplay: handleReplay,
    onRestart: handleRestart,
  });

  // The view reports its grid before the first attach and on every fit, so the
  // PTY is created at the panel's real size instead of a default 80x24.
  const handleReady = useCallback((cols: number, rows: number) => {
    gridRef.current = { cols, rows };
    attach(cols, rows);
  }, [attach]);

  const handleGridChange = useCallback((cols: number, rows: number) => {
    const previous = gridRef.current;
    gridRef.current = { cols, rows };
    if (!previous) return;
    resize(cols, rows);
  }, [resize]);

  // Keystrokes arrive as text; `onBinary` payloads are latin-1 bytes and must
  // not be UTF-8 encoded on the way out.
  const handleInput = useCallback((data: string) => {
    input(encoder.encode(data));
  }, [input]);

  const handleBinaryInput = useCallback((data: string) => {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
    input(bytes);
  }, [input]);

  const handleQuickAction = useCallback((command: string) => {
    input(encoder.encode(`${command}\r`));
    xtermRef.current?.focus();
  }, [input]);

  const handleRestartClick = useCallback(() => {
    restart();
  }, [restart]);

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full w-full bg-paper text-ink overflow-hidden ${className}`}>
      {showHeader && (
        <TerminalHeader
          status={status}
          exitCode={exitCode}
          rootPath={rootPath}
          activeRepo={activeRepo}
          onSelectRepo={setActiveRepo}
          repos={repos}
          reposScanning={reposScanning}
          onRefreshRepos={rescanRepos}
          cwd={cwd}
          shell={shell}
          gitBranch={systemInfo.gitBranch}
          onRestart={handleRestartClick}
        />
      )}

      {/* Preset command shortcuts: typed into the live shell, not a new process */}
      <TerminalQuickActions onSelectCommand={handleQuickAction} disabled={status !== 'running'} />

      {error && (
        <div className="px-3 py-1.5 border-b border-error/20 bg-error/5 text-[11px] font-mono text-error flex-shrink-0">
          {error}
        </div>
      )}

      {/* Real-time Xterm Terminal Canvas, driven by the PTY socket */}
      <div className="flex-1 w-full min-h-0 bg-canvas overflow-hidden">
        <RealtimeXtermView
          ref={xtermRef}
          onInput={handleInput}
          onBinaryInput={handleBinaryInput}
          onReady={handleReady}
          onGridChange={handleGridChange}
        />
      </div>
    </div>
  );
}
