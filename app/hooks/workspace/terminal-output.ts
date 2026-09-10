import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useSessionState } from '@/hooks/workspace/session-state';
import { useSessionStateContext } from '@/hooks/workspace/session-state/context';
import { getSessionValue } from '@/lib/workspace/session-state/store';
import {
  appendTerminalSessionOutput,
  clearTerminalSessionOutput,
  getTerminalOutputSnapshot,
  setTerminalOutputSnapshot,
} from '@/data/theme/terminal';

interface TerminalOutputSync {
  recordOutput: (chunk: string) => void;
  clearOutput: () => void;
}

const OUTPUT_PERSIST_INTERVAL_MS = 1000;

export function useTerminalOutputSync(terminalRef: RefObject<Terminal | null>): TerminalOutputSync {
  const { sessionId, ready } = useSessionStateContext();
  const [, setStoredOutput] = useSessionState<string>('terminal.output', '');
  const setStoredOutputRef = useRef(setStoredOutput);
  setStoredOutputRef.current = setStoredOutput;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const lastPersistRef = useRef(0);
  const hydratedSessionRef = useRef<string | null>(null);
  const prevHydratedSessionRef = useRef<string | null>(null);

  const recordOutput = useCallback((chunk: string) => {
    appendTerminalSessionOutput(chunk);
    if (!readyRef.current) return;
    const now = Date.now();
    if (now - lastPersistRef.current < OUTPUT_PERSIST_INTERVAL_MS) return;
    lastPersistRef.current = now;
    setStoredOutputRef.current(getTerminalOutputSnapshot());
  }, []);

  const clearOutput = useCallback(() => {
    clearTerminalSessionOutput();
    if (!readyRef.current) return;
    lastPersistRef.current = Date.now();
    setStoredOutputRef.current('');
  }, []);

  // On restore, seed the module singleton before xterm rehydrates it; when the
  // term is already live, replace its buffer. A session switch always re-seeds,
  // while an initial mount without a stored snapshot keeps the live output.
  useEffect(() => {
    if (!ready || hydratedSessionRef.current === sessionId) return;
    const isSessionSwitch = prevHydratedSessionRef.current !== null;
    hydratedSessionRef.current = sessionId;
    prevHydratedSessionRef.current = sessionId;
    const restored = getSessionValue<string>(sessionId, 'terminal.output');
    if (restored === undefined && !isSessionSwitch) return;
    setTerminalOutputSnapshot(restored ?? '');
    const term = terminalRef.current;
    if (!term) return;
    term.clear();
    if (restored) {
      term.write(restored);
      term.scrollToBottom();
    } else {
      term.write('\x1b[33m$\x1b[0m ');
    }
  }, [ready, sessionId, terminalRef]);

  return { recordOutput, clearOutput };
}
