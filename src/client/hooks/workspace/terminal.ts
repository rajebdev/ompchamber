import type { TargetedKeyboardEvent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';
import type { TerminalLogItem } from '@/shared/types';

const DEFAULT_COMMAND_HISTORY = ['bun --version', 'bun run build', 'git status -s'];

const MAX_TERMINAL_LOGS = 50;

function capLogs(items: TerminalLogItem[]): TerminalLogItem[] {
  return items.length > MAX_TERMINAL_LOGS ? items.slice(-MAX_TERMINAL_LOGS) : items;
}

export interface UseTerminalOptions {
  onStreamChunk?: (text: string) => void;
  onCommandStart?: (cmd: string, options?: { fromXterm?: boolean }) => void;
  onCommandEnd?: (exitCode: number, cwd: string) => void;
  onClear?: () => void;
  root?: string;
  repo?: string;
}

export function useTerminal(options?: UseTerminalOptions) {
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogItem[]>([]);
  const [terminalInput, setTerminalInput] = useSessionState<string>('terminal.input', '');
  const [isRunning, setIsRunning] = useState(false);
  const [cwd, setCwd] = useSessionState<string>('terminal.cwd', '.');
  const [commandHistory, setCommandHistory] = useSessionState<string[]>('terminal.commandHistory', DEFAULT_COMMAND_HISTORY);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);
  const [systemInfo, setSystemInfo] = useState<{
    bunVersion: string;
    nodeVersion: string;
    gitBranch: string;
  }>({
    bunVersion: '',
    nodeVersion: '',
    gitBranch: 'main',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamCallbackRef = useRef(options?.onStreamChunk);
  streamCallbackRef.current = options?.onStreamChunk;

  const commandStartRef = useRef(options?.onCommandStart);
  commandStartRef.current = options?.onCommandStart;

  const commandEndRef = useRef(options?.onCommandEnd);
  commandEndRef.current = options?.onCommandEnd;

  const clearCallbackRef = useRef(options?.onClear);
  clearCallbackRef.current = options?.onClear;

  const rootRef = useRef(options?.root);
  rootRef.current = options?.root;
  const prevRootRef = useRef(options?.root);

  const repoRef = useRef(options?.repo);
  repoRef.current = options?.repo;
  const prevRepoRef = useRef(options?.repo);

  const { sessionId, ready } = useSessionStateContext();
  const sessionIdRef = useRef(sessionId);
  const absorbRestoreRef = useRef(true);

  // Absorb the repo/cwd prop changes produced by a session restore (skip the
  // reset for one tick after the blob loads), while genuine repo changes on a
  // settled session still clear cwd/logs.
  useEffect(() => {
    if (sessionIdRef.current !== sessionId) {
      sessionIdRef.current = sessionId;
      absorbRestoreRef.current = true;
    }
    if (!ready || !absorbRestoreRef.current) return;
    const timer = setTimeout(() => {
      absorbRestoreRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionId, ready]);

  // Fetch real system environment on mount / when the scoped root or repo changes
  useEffect(() => {
    const root = options?.root;
    const repo = options?.repo;
    if (prevRootRef.current !== root || prevRepoRef.current !== repo) {
      prevRootRef.current = root;
      prevRepoRef.current = repo;
      if (!absorbRestoreRef.current) {
        setCwd('.');
        setTerminalLogs([]);
        clearCallbackRef.current?.();
      }
    }
    const rootQuery = root ? `?root=${encodeURIComponent(root)}` : '';
    const repoQuery = repo && repo !== '.' ? `&repo=${encodeURIComponent(repo)}` : '';
    fetch(`/api/terminal/run${rootQuery}${repoQuery}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.bunVersion) {
          setSystemInfo({
            bunVersion: data.bunVersion ?? '',
            nodeVersion: data.nodeVersion ?? '',
            gitBranch: data.gitBranch || 'main',
          });
        }
      })
      .catch(() => {});
  }, [options?.root, options?.repo]);

  const clearLogs = useCallback(() => {
    setTerminalLogs([]);
  }, []);

  const executeCommand = useCallback(
    async (customCommand?: string, options?: { fromXterm?: boolean }) => {
      const rawCmd = (customCommand !== undefined ? customCommand : terminalInput).trim();
      if (!rawCmd || isRunning) return;

      // Handle clear command locally
      if (rawCmd === 'clear' || rawCmd === 'cls') {
        setTerminalLogs([]);
        setTerminalInput('');
        setHistoryPointer(-1);
        clearCallbackRef.current?.();
        return;
      }

      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = new Date().toLocaleTimeString();

      // Add to history
      setCommandHistory(prev => (prev[prev.length - 1] === rawCmd ? prev : [...prev, rawCmd]));
      setHistoryPointer(-1);
      setTerminalInput('');
      setIsRunning(true);

      // Notify start to xterm
      commandStartRef.current?.(rawCmd, options);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedStdout = '';
      let exitCode = 0;
      let nextCwd = cwd;

      try {
        const rootQuery = rootRef.current ? `&root=${encodeURIComponent(rootRef.current)}` : '';
        const repoQuery = repoRef.current && repoRef.current !== '.' ? `&repo=${encodeURIComponent(repoRef.current)}` : '';
        const streamUrl = `/api/terminal/stream?cmd=${encodeURIComponent(rawCmd)}&cwd=${encodeURIComponent(cwd)}${rootQuery}${repoQuery}`;
        const response = await fetch(streamUrl, {
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error('Streaming not supported by browser');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              try {
                const payload = JSON.parse(dataStr);
                if (currentEvent === 'data' && payload.text) {
                  const normalizedText = payload.text.replace(/\r?\n/g, '\r\n');
                  accumulatedStdout += normalizedText;
                  streamCallbackRef.current?.(normalizedText);
                } else if (currentEvent === 'exit') {
                  exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : 0;
                  if (payload.cwd && payload.cwd !== cwd) {
                    nextCwd = payload.cwd;
                    setCwd(payload.cwd);
                  }
                }
              } catch {}
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          exitCode = 130;
          const abortMsg = '\r\n^C (Interrupted)\r\n';
          accumulatedStdout += abortMsg;
          streamCallbackRef.current?.(abortMsg);
        } else {
          exitCode = 1;
          const errMsg = `\r\n\x1b[31mError: ${err.message || 'Execution failed'}\x1b[0m\r\n`;
          accumulatedStdout += errMsg;
          streamCallbackRef.current?.(errMsg);
        }
      } finally {
        setIsRunning(false);
        abortControllerRef.current = null;
        commandEndRef.current?.(exitCode, nextCwd);

        setTerminalLogs(prev =>
          capLogs([
            ...prev,
            {
              id: commandId,
              command: rawCmd,
              stdout: accumulatedStdout,
              exitCode,
              timestamp,
              cwd: nextCwd,
            },
          ])
        );
      }
    },
    [terminalInput, isRunning, cwd, sessionId]
  );

  const cancelRunningCommand = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        setHistoryPointer(prev => {
          const next = prev === -1 ? commandHistory.length - 1 : Math.max(0, prev - 1);
          setTerminalInput(commandHistory[next] || '');
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyPointer === -1) return;
        setHistoryPointer(prev => {
          const next = prev + 1;
          if (next >= commandHistory.length) {
            setTerminalInput('');
            return -1;
          }
          setTerminalInput(commandHistory[next] || '');
          return next;
        });
      } else if (e.key === 'c' && e.ctrlKey) {
        if (isRunning) {
          cancelRunningCommand();
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        clearLogs();
        clearCallbackRef.current?.();
      }
    },
    [commandHistory, historyPointer, isRunning, cancelRunningCommand, clearLogs, sessionId]
  );

  return {
    terminalLogs,
    terminalInput,
    setTerminalInput,
    isRunning,
    cwd,
    systemInfo,
    executeCommand,
    clearLogs,
    cancelRunningCommand,
    handleKeyDown,
  };
}
