import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '@/hooks/useTheme';
import {
  getXtermTheme,
  XTERM_FONT_FAMILY,
  safePatchFitAddon,
  safePatchRenderService,
  getTerminalSessionOutput,
  appendTerminalSessionOutput,
  clearTerminalSessionOutput,
} from '@/data/terminalTheme';

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
  onCommandSubmit?: (cmd: string, options?: { fromXterm?: boolean }) => void;
  cwd: string;
}

function handleKeyNavigation(term: Terminal, event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return true;
  if (event.shiftKey) {
    if (event.key === 'PageUp') { term.scrollPages(-1); return false; }
    if (event.key === 'PageDown') { term.scrollPages(1); return false; }
    if (event.key === 'Home') { term.scrollToTop(); return false; }
    if (event.key === 'End') { term.scrollToBottom(); return false; }
    if (event.key === 'ArrowUp') { term.scrollLines(-1); return false; }
    if (event.key === 'ArrowDown') { term.scrollLines(1); return false; }
  }
  return true;
}

export const RealtimeXtermView = forwardRef<RealtimeXtermHandle, RealtimeXtermViewProps>(
  ({ onCommandSubmit, cwd: _cwd }, ref) => {
    const { isDark } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const inputBufferRef = useRef<string>('');
    const pendingWritesRef = useRef<string[]>([]);
    const [isScrolledUp, setIsScrolledUp] = useState(false);
    const onCommandSubmitRef = useRef(onCommandSubmit);

    useEffect(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = getXtermTheme(isDark);
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      }
    }, [isDark]);

    useEffect(() => {
      onCommandSubmitRef.current = onCommandSubmit;
    }, [onCommandSubmit]);

    const scrollToBottom = useCallback(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollToBottom();
        setIsScrolledUp(false);
      }
    }, []);

    const scrollToTop = useCallback(() => {
      terminalRef.current?.scrollToTop();
    }, []);

    const scrollLines = useCallback((amount: number) => {
      terminalRef.current?.scrollLines(amount);
    }, []);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        appendTerminalSessionOutput(data);
        if (terminalRef.current) {
          const term = terminalRef.current;
          const wasAtBottom = term.buffer.active.viewportY === term.buffer.active.baseY;
          term.write(data, () => {
            if (wasAtBottom) term.scrollToBottom();
          });
        } else {
          pendingWritesRef.current.push(data);
        }
      },
      writeln: (line: string) => {
        appendTerminalSessionOutput(line + '\r\n');
        if (terminalRef.current) {
          const term = terminalRef.current;
          const wasAtBottom = term.buffer.active.viewportY === term.buffer.active.baseY;
          term.writeln(line, () => {
            if (wasAtBottom) term.scrollToBottom();
          });
        } else {
          pendingWritesRef.current.push(line + '\r\n');
        }
      },
      clear: () => {
        clearTerminalSessionOutput();
        if (terminalRef.current) {
          terminalRef.current.clear();
          terminalRef.current.write('\r\x1b[33m$\x1b[0m ');
          appendTerminalSessionOutput('\r\x1b[33m$\x1b[0m ');
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
      let fitTimeout: ReturnType<typeof setTimeout> | null = null;
      let rafId: number | null = null;
      let cleanupTouch: (() => void) | null = null;

      const safeFit = () => {
        if (!isMounted || !termInstance || !fitAddonInstance || !containerRef.current) return;
        const el = containerRef.current;
        if (el.clientWidth <= 0 || el.clientHeight <= 0) return;
        try {
          const core = (termInstance as any)._core;
          const renderService = core?._renderService;
          if (!renderService) return;
          const dims = renderService.dimensions;
          if (!dims?.css?.cell?.width || !dims?.css?.cell?.height) return;
          fitAddonInstance.fit();
        } catch {}
      };

      async function initXterm() {
        if (!containerRef.current || !isMounted) return;

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

        safePatchFitAddon(FitAddonClass);

        const term = new TerminalClass({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize: 12,
          lineHeight: 1.25,
          fontFamily: XTERM_FONT_FAMILY,
          theme: getXtermTheme(isDark),
          convertEol: true,
          scrollback: 10000,
          scrollSensitivity: 1.5,
          fastScrollSensitivity: 5,
          smoothScrollDuration: 0,
          allowProposedApi: true,
        }) as Terminal;

        term.open(containerRef.current);
        safePatchRenderService(term);

        const fitAddon = new FitAddonClass() as FitAddon;
        term.loadAddon(fitAddon);

        termInstance = term;
        fitAddonInstance = fitAddon;
        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        rafId = requestAnimationFrame(() => {
          if (isMounted) safeFit();
        });

        term.attachCustomKeyEventHandler((event: KeyboardEvent) => handleKeyNavigation(term, event));

        scrollDisposable = term.onScroll(() => {
          const buffer = term.buffer.active;
          setIsScrolledUp(buffer.viewportY < buffer.baseY);
        });

        const savedOutput = getTerminalSessionOutput();
        if (savedOutput) {
          term.write(savedOutput);
        } else {
          const welcome = '\x1b[1;33m[OMPChamber Realtime Terminal]\x1b[0m\r\n\x1b[90mRuntime: Bun v1.4.0 • Node v22 • remisJS Edge\x1b[0m\r\n\x1b[90mStream connected. Live xterm canvas active.\x1b[0m\r\n\r\n\x1b[33m$\x1b[0m ';
          term.write(welcome);
          appendTerminalSessionOutput(welcome);
        }

        if (pendingWritesRef.current.length > 0) {
          for (const chunk of pendingWritesRef.current) {
            term.write(chunk);
          }
          pendingWritesRef.current = [];
          term.scrollToBottom();
        }

        dataDisposable = term.onData((data: string) => {
          if (data === '\r') {
            const cmd = inputBufferRef.current.trim();
            term.write('\r\n');
            inputBufferRef.current = '';
            if (cmd && onCommandSubmitRef.current) {
              appendTerminalSessionOutput(cmd + '\r\n');
              onCommandSubmitRef.current(cmd, { fromXterm: true });
            } else {
              term.write('\x1b[33m$\x1b[0m ');
              appendTerminalSessionOutput('\r\n\x1b[33m$\x1b[0m ');
            }
          } else if (data === '\x7f' || data === '\b') {
            if (inputBufferRef.current.length > 0) {
              inputBufferRef.current = inputBufferRef.current.slice(0, -1);
              term.write('\b \b');
            }
          } else if (data === '\x03') {
            inputBufferRef.current = '';
            term.write('^C\r\n\x1b[33m$\x1b[0m ');
            appendTerminalSessionOutput('^C\r\n\x1b[33m$\x1b[0m ');
          } else if (data === '\x0c') {
            clearTerminalSessionOutput();
            term.clear();
            term.write('\x1b[33m$\x1b[0m ');
            appendTerminalSessionOutput('\x1b[33m$\x1b[0m ');
          } else if (data >= ' ') {
            inputBufferRef.current += data;
            term.write(data);
          }
        });

        let touchStartY = 0;
        const containerEl = containerRef.current;
        const handleTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
        };
        const handleTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            const deltaY = touchStartY - e.touches[0].clientY;
            if (Math.abs(deltaY) >= 16) {
              term.scrollLines(Math.trunc(deltaY / 16));
              touchStartY = e.touches[0].clientY;
            }
          }
        };

        if (containerEl) {
          containerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
          containerEl.addEventListener('touchmove', handleTouchMove, { passive: true });
          cleanupTouch = () => {
            containerEl.removeEventListener('touchstart', handleTouchStart);
            containerEl.removeEventListener('touchmove', handleTouchMove);
          };
        }

        resizeObserver = new ResizeObserver(() => {
          if (fitTimeout) clearTimeout(fitTimeout);
          fitTimeout = setTimeout(() => {
            safeFit();
          }, 35);
        });

        if (containerEl) {
          resizeObserver.observe(containerEl);
        }
      }

      initXterm();

      return () => {
        isMounted = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (fitTimeout !== null) clearTimeout(fitTimeout);
        cleanupTouch?.();
        dataDisposable?.dispose();
        scrollDisposable?.dispose();
        resizeObserver?.disconnect();
        try {
          fitAddonInstance?.dispose();
        } catch {}
        try {
          termInstance?.dispose();
        } catch {}
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, []);

    return (
      <div className="relative flex-1 w-full h-full bg-canvas overflow-hidden">
        <div
          ref={containerRef}
          className="w-full h-full cursor-text p-1.5"
          style={{ height: '100%', width: '100%' }}
        />

        {isScrolledUp && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 z-20 flex items-center space-x-1.5 px-2.5 py-1 bg-paper hover:bg-canvas text-ink border border-ink/20 rounded-full shadow-lg text-[11px] font-mono transition-all animate-fade-in cursor-pointer active:scale-95"
            title="Scroll to latest output (Shift+End)"
          >
            <ArrowDown size={12} className="text-warning" />
            <span>Latest</span>
          </button>
        )}
      </div>
    );
  }
);

RealtimeXtermView.displayName = 'RealtimeXtermView';
