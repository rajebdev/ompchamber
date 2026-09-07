import React, { useRef, useCallback } from 'react';
import { useTerminal } from '@/hooks/useTerminal';
import { TerminalHeader } from './terminal-panel/TerminalHeader';
import { TerminalQuickActions } from './terminal-panel/TerminalQuickActions';
import { TerminalInputBar } from './terminal-panel/TerminalInputBar';
import { RealtimeXtermView, type RealtimeXtermHandle } from './terminal-panel/RealtimeXtermView';

interface TerminalPanelProps {
  className?: string;
  onClose?: () => void;
  showHeader?: boolean;
}

export function TerminalPanel({ className = '', onClose, showHeader = true }: TerminalPanelProps) {
  const xtermRef = useRef<RealtimeXtermHandle>(null);

  const handleStreamChunk = useCallback((text: string) => {
    xtermRef.current?.write(text);
  }, []);

  const handleCommandStart = useCallback((cmd: string) => {
    xtermRef.current?.write(`\r\n\x1b[1;33m$\x1b[0m \x1b[1m${cmd}\x1b[0m\r\n`);
  }, []);

  const handleCommandEnd = useCallback((exitCode: number, _cwd: string) => {
    if (exitCode !== 0 && exitCode !== 130) {
      xtermRef.current?.write(`\x1b[31m[exit ${exitCode}]\x1b[0m\r\n`);
    }
    xtermRef.current?.write(`\x1b[33m$\x1b[0m `);
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
  });

  const handleClear = useCallback(() => {
    clearLogs();
    xtermRef.current?.clear();
  }, [clearLogs]);

  return (
    <div className={`flex flex-col h-full w-full bg-paper text-ink overflow-hidden ${className}`}>
      {showHeader && (
        <TerminalHeader
          cwd={cwd}
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
          onCommandSubmit={cmd => executeCommand(cmd)}
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
