import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export interface RealtimeXtermHandle {
  write: (data: string) => void;
  writeln: (line: string) => void;
  clear: () => void;
  focus: () => void;
  scrollToBottom: () => void;
  scrollToTop: () => void;
  scrollLines: (amount: number) => void;
}

interface RealtimeXtermViewProps {
  onCommandSubmit?: (cmd: string) => void;
  cwd: string;
}

export const RealtimeXtermView = forwardRef<RealtimeXtermHandle, RealtimeXtermViewProps>(
  ({ onCommandSubmit, cwd: _cwd }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const inputBufferRef = useRef<string>('');
    const pendingWritesRef = useRef<string[]>([]);
    const [isScrolledUp, setIsScrolledUp] = useState(false);

    const scrollToBottom = useCallback(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollToBottom();
        setIsScrolledUp(false);
      }
    }, []);

    const scrollToTop = useCallback(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollToTop();
      }
    }, []);

    const scrollLines = useCallback((amount: number) => {
      if (terminalRef.current) {
        terminalRef.current.scrollLines(amount);
      }
    }, []);

    // Expose methods to parent with buffering if xterm is not ready yet
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        if (terminalRef.current) {
          const term = terminalRef.current;
          const wasAtBottom = term.buffer.active.viewportY === term.buffer.active.baseY;
          term.write(data, () => {
            if (wasAtBottom) {
              term.scrollToBottom();
            }
          });
        } else {
          pendingWritesRef.current.push(data);
        }
      },
      writeln: (line: string) => {
        if (terminalRef.current) {
          const term = terminalRef.current;
          const wasAtBottom = term.buffer.active.viewportY === term.buffer.active.baseY;
          term.writeln(line, () => {
            if (wasAtBottom) {
              term.scrollToBottom();
            }
          });
        } else {
          pendingWritesRef.current.push(line + '\r\n');
        }
      },
      clear: () => {
        if (terminalRef.current) {
          terminalRef.current.clear();
          terminalRef.current.write('\r\x1b[33m$\x1b[0m ');
          setIsScrolledUp(false);
        } else {
          pendingWritesRef.current = [];
        }
      },
      focus: () => {
        terminalRef.current?.focus();
      },
      scrollToBottom,
      scrollToTop,
      scrollLines,
    }));

    useEffect(() => {
      let isMounted = true;
      let termInstance: Terminal | null = null;
      let fitAddonInstance: FitAddon | null = null;
      let resizeObserver: ResizeObserver | null = null;
      let dataDisposable: { dispose: () => void } | null = null;
      let scrollDisposable: { dispose: () => void } | null = null;

      async function initXterm() {
        if (!containerRef.current || !isMounted) return;

        // Dynamic client-side import with CJS/ESM interop
        const xtermModule = await import('@xterm/xterm');
        const fitModule = await import('@xterm/addon-fit');

        const TerminalClass =
          xtermModule.Terminal ||
          (xtermModule.default && (xtermModule.default as any).Terminal) ||
          xtermModule.default;

        const FitAddonClass =
          fitModule.FitAddon ||
          (fitModule.default && (fitModule.default as any).FitAddon) ||
          fitModule.default;

        if (!TerminalClass || !FitAddonClass || !containerRef.current || !isMounted) return;

        const term = new TerminalClass({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize: 12,
          lineHeight: 1.25,
          fontFamily: "'IBM Plex Mono', Menlo, Monaco, 'Courier New', monospace",
          theme: {
            background: '#141310',
            foreground: '#f4f1ea',
            cursor: '#f4f1ea',
            cursorAccent: '#141310',
            selectionBackground: '#3a3832',
            black: '#141310',
            red: '#c8321e',
            green: '#10b981',
            yellow: '#f59e0b',
            blue: '#3b82f6',
            magenta: '#ec4899',
            cyan: '#06b6d4',
            white: '#f4f1ea',
            brightBlack: '#48453d',
            brightRed: '#ef4444',
            brightGreen: '#34d399',
            brightYellow: '#fbbf24',
            brightBlue: '#60a5fa',
            brightMagenta: '#f472b6',
            brightCyan: '#38bdf8',
            brightWhite: '#ffffff',
          },
          convertEol: true,
          scrollback: 10000,
          scrollSensitivity: 1.5,
          fastScrollSensitivity: 5,
          smoothScrollDuration: 0,
          allowProposedApi: true,
        }) as Terminal;

        const fitAddon = new FitAddonClass() as FitAddon;
        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        // Safe initial fit
        requestAnimationFrame(() => {
          if (isMounted) {
            try {
              fitAddon.fit();
            } catch {}
          }
        });

        termInstance = term;
        fitAddonInstance = fitAddon;
        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        // Custom keyboard shortcuts for scroll navigation
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if (event.type === 'keydown') {
            if (event.shiftKey && event.key === 'PageUp') {
              term.scrollPages(-1);
              return false;
            }
            if (event.shiftKey && event.key === 'PageDown') {
              term.scrollPages(1);
              return false;
            }
            if (event.shiftKey && event.key === 'Home') {
              term.scrollToTop();
              return false;
            }
            if (event.shiftKey && event.key === 'End') {
              term.scrollToBottom();
              return false;
            }
            if (event.shiftKey && event.key === 'ArrowUp') {
              term.scrollLines(-1);
              return false;
            }
            if (event.shiftKey && event.key === 'ArrowDown') {
              term.scrollLines(1);
              return false;
            }
          }
          return true;
        });

        // Track scroll position to update floating indicator
        scrollDisposable = term.onScroll(() => {
          const buffer = term.buffer.active;
          const isUp = buffer.viewportY < buffer.baseY;
          setIsScrolledUp(isUp);
        });

        // Welcome banner
        term.writeln('\x1b[1;33m[OMPChamber Realtime Terminal]\x1b[0m');
        term.writeln('\x1b[90mRuntime: Bun v1.4.0 • Node v22 • remisJS Edge\x1b[0m');
        term.writeln('\x1b[90mStream connected. Live xterm canvas active.\x1b[0m');
        term.write('\r\n\x1b[33m$\x1b[0m ');

        // Flush any pending buffered writes
        if (pendingWritesRef.current.length > 0) {
          for (const chunk of pendingWritesRef.current) {
            term.write(chunk);
          }
          pendingWritesRef.current = [];
          term.scrollToBottom();
        }

        // Handle keyboard input
        dataDisposable = term.onData((data: string) => {
          if (data === '\r') {
            const cmd = inputBufferRef.current.trim();
            term.write('\r\n');
            inputBufferRef.current = '';
            if (cmd && onCommandSubmit) {
              onCommandSubmit(cmd);
            } else {
              term.write('\x1b[33m$\x1b[0m ');
            }
          } else if (data === '\x7f' || data === '\b') {
            if (inputBufferRef.current.length > 0) {
              inputBufferRef.current = inputBufferRef.current.slice(0, -1);
              term.write('\b \b');
            }
          } else if (data === '\x03') {
            inputBufferRef.current = '';
            term.write('^C\r\n\x1b[33m$\x1b[0m ');
          } else if (data === '\x0c') {
            term.clear();
            term.write('\x1b[33m$\x1b[0m ');
          } else if (data >= ' ') {
            inputBufferRef.current += data;
            term.write(data);
          }
        });

        // Touch scroll support on mobile touch devices
        let touchStartY = 0;
        const containerEl = containerRef.current;

        const handleTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            touchStartY = e.touches[0].clientY;
          }
        };

        const handleTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            const deltaY = touchStartY - e.touches[0].clientY;
            const lineHeight = 16;
            if (Math.abs(deltaY) >= lineHeight) {
              const lines = Math.trunc(deltaY / lineHeight);
              term.scrollLines(lines);
              touchStartY = e.touches[0].clientY;
            }
          }
        };

        if (containerEl) {
          containerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
          containerEl.addEventListener('touchmove', handleTouchMove, { passive: true });
        }

        // Auto-fit on layout or container size change with debouncing
        let fitTimeout: ReturnType<typeof setTimeout> | null = null;
        resizeObserver = new ResizeObserver(() => {
          if (fitTimeout) clearTimeout(fitTimeout);
          fitTimeout = setTimeout(() => {
            try {
              fitAddon.fit();
            } catch {}
          }, 30);
        });

        if (containerEl) {
          resizeObserver.observe(containerEl);
        }
      }

      initXterm();

      return () => {
        isMounted = false;
        dataDisposable?.dispose();
        scrollDisposable?.dispose();
        resizeObserver?.disconnect();
        termInstance?.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, [onCommandSubmit]);

    return (
      <div className="relative flex-1 w-full h-full bg-[#141310] overflow-hidden">
        <div
          ref={containerRef}
          className="w-full h-full cursor-text p-1.5"
          style={{ height: '100%', width: '100%' }}
        />

        {/* Floating Scroll to Bottom pill when scrolled up */}
        {isScrolledUp && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 z-20 flex items-center space-x-1.5 px-2.5 py-1 bg-[#24221d] hover:bg-[#34322a] text-[#f4f1ea] border border-[#f4f1ea]/15 rounded-full shadow-lg text-[11px] font-mono transition-all animate-fade-in cursor-pointer active:scale-95"
            title="Scroll to latest output (Shift+End)"
          >
            <ArrowDown size={12} className="text-amber-400" />
            <span>Latest</span>
          </button>
        )}
      </div>
    );
  }
);

RealtimeXtermView.displayName = 'RealtimeXtermView';
