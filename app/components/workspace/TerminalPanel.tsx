import React, { useRef, useCallback } from 'react';
import { useTerminal } from '@/hooks/useTerminal';
import { TerminalHeader } from './terminal-panel/TerminalHeader';
import { TerminalQuickActions } from './terminal-panel/TerminalQuickActions';
import { TerminalInputBar } from './terminal-panel/TerminalInputBar';
import { RealtimeXtermView, type RealtimeXtermHandle } from './terminal-panel/RealtimeXtermView';

interface TerminalPanelProps {
  className?: string;
  enabled?: boolean;
  rootPath?: string;
  onClose?: () => void;
  showHeader?: boolean;
}

export function TerminalPanel({ className = '', enabled = true, rootPath, onClose, showHeader = true }: TerminalPanelProps) {
  const xtermRef = useRef<RealtimeXtermHandle>(null);

  const rootName = rootPath ? rootPath.replace(/\/+$/, '').split('/').pop() : undefined;

  const handleStreamChunk = useCallback((text: string) => {
    xtermRef.current?.write(text);
  }, []);

  const handleCommandStart = useCallback((cmd: string, options?: { fromXterm?: boolean }) => {
    if (!options?.fromXterm) {
      xtermRef.current?.write(`\r\x1b[K\x1b[33m$\x1b[0m \x1b[1m${cmd}\x1b[0m\r\n`);
    }
  }, []);

  const handleCommandEnd = useCallback((exitCode: number, _cwd: string) => {
    if (exitCode !== 0 && exitCode !== 130) {
      xtermRef.current?.write(`\x1b[31m[exit ${exitCode}]\x1b[0m\r\n`);
    }
    xtermRef.current?.write(`\x1b[33m$\x1b[0m `);
  }, []);

  const handleXtermClear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const {
    terminalInput,
    setTerminalInput,
    isRunning,
    cwd,
    systemInfo,
    executeCommand,
    clearLogs,
    cancelRunningCommand,
    handleKeyDown,
  } = useTerminal({
    onStreamChunk: handleStreamChunk,
    onCommandStart: handleCommandStart,
    onCommandEnd: handleCommandEnd,
    onClear: handleXtermClear,
    root: enabled ? rootPath : undefined,
  });

  const handleClear = useCallback(() => {
    clearLogs();
    xtermRef.current?.clear();
  }, [clearLogs]);

  const handleCommandSubmit = useCallback((cmd: string, options?: { fromXterm?: boolean }) => {
    executeCommand(cmd, options);
  }, [executeCommand]);

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
          cwd={cwd}
          rootName={rootName}
          isRunning={isRunning}
          bunVersion={systemInfo.bunVersion}
          onClear={handleClear}
          onClose={onClose}
        />
      )}

      {/* Preset Command Shortcuts */}
      <TerminalQuickActions
        onSelectCommand={executeCommand}
        disabled={isRunning}
      />

      {/* Real-time Xterm Terminal Canvas */}
      <div className="flex-1 w-full min-h-0 bg-[#141310] overflow-hidden">
        <RealtimeXtermView
          ref={xtermRef}
          cwd={cwd}
          onCommandSubmit={handleCommandSubmit}
        />
      </div>

      {/* Input Bar with History and Cancel controls */}
      <TerminalInputBar
        value={terminalInput}
        onChange={setTerminalInput}
        onSubmit={() => executeCommand()}
        onKeyDown={handleKeyDown}
        onCancel={cancelRunningCommand}
        isRunning={isRunning}
        cwd={cwd}
      />
    </div>
  );
}
