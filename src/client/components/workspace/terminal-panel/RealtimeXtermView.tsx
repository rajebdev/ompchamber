import { useEffect, useRef, useState, useImperativeHandle, useCallback } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { ArrowDown } from 'lucide-preact';
import { useTheme } from '@/client/hooks/ui/theme';
import { getXtermTheme } from '@/client/data/theme/terminal';
import { mountXterm, type XtermMount } from '@/client/components/workspace/terminal-panel/mount';

export interface RealtimeXtermHandle {
  /** Raw PTY output. Bytes, not text: xterm's decoder reassembles them. */
  write: (bytes: Uint8Array) => void;
  /**
   * Write the retained scrollback at the size it was drawn for, then fit back
   * to the panel. Replaying history at another width leaves wrapped fragments
   * the shell's own redraw never clears.
   */
  writeReplay: (bytes: Uint8Array, cols: number, rows: number) => void;
  /** Drop the buffer and reset the cursor — used when the shell is replaced. */
  reset: () => void;
  focus: () => void;
}

interface RealtimeXtermViewProps {
  /** Keystrokes and paste, raw. */
  onInput: (data: string) => void;
  /** Non-UTF-8 payloads xterm reports separately (some mouse reports). */
  onBinaryInput: (data: string) => void;
  /** The grid changed; the PTY must be resized to match. */
  onGridChange: (cols: number, rows: number) => void;
  /** The terminal is measurable and knows its size; attach with these. */
  onReady: (cols: number, rows: number) => void;
}

/**
 * xterm view bound to a real PTY.
 *
 * Every keystroke goes to the shell as bytes — line editing, history, tab
 * completion and Ctrl+C are the shell's job, not this component's. Output is
 * written as bytes so a character split across two PTY reads is reassembled by
 * xterm's own streaming decoder rather than by a decode step here.
 */
export const RealtimeXtermView = forwardRef<RealtimeXtermHandle, RealtimeXtermViewProps>(
  ({ onInput, onBinaryInput, onGridChange, onReady }, ref) => {
    const { isDark } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const mountRef = useRef<XtermMount | null>(null);
    const [isScrolledUp, setIsScrolledUp] = useState(false);

    const inputRef = useRef(onInput);
    inputRef.current = onInput;
    const binaryInputRef = useRef(onBinaryInput);
    binaryInputRef.current = onBinaryInput;
    const gridChangeRef = useRef(onGridChange);
    gridChangeRef.current = onGridChange;
    const readyRef = useRef(onReady);
    readyRef.current = onReady;
    const themeRef = useRef(isDark);
    themeRef.current = isDark;

    useEffect(() => {
      const term = mountRef.current?.term;
      if (!term) return;
      term.options.theme = getXtermTheme(isDark);
      term.refresh(0, term.rows - 1);
    }, [isDark]);

    useImperativeHandle(ref, () => ({
      write(bytes: Uint8Array) {
        mountRef.current?.term.write(bytes);
      },
      writeReplay(bytes: Uint8Array, cols: number, rows: number) {
        mountRef.current?.writeReplay(bytes, cols, rows);
      },
      reset() {
        mountRef.current?.term.reset();
      },
      focus() {
        mountRef.current?.term.focus();
      },
    }), []);

    const scrollToBottom = useCallback(() => {
      mountRef.current?.term.scrollToBottom();
      setIsScrolledUp(false);
    }, []);

    // Mount once. Sizing flows out through callbacks; the server owns the PTY,
    // so nothing here restarts a shell on its own.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let cancelled = false;

      void mountXterm(
        container,
        themeRef.current,
        {
          onInput: (data) => inputRef.current(data),
          onBinaryInput: (data) => binaryInputRef.current(data),
          onGridChange: (cols, rows) => gridChangeRef.current(cols, rows),
          onReady: (cols, rows) => readyRef.current(cols, rows),
          onScrolledUpChange: setIsScrolledUp,
        },
        () => cancelled,
      ).then((mount) => {
        if (!mount) return;
        if (cancelled) {
          mount.dispose();
          return;
        }
        mountRef.current = mount;
      });

      return () => {
        cancelled = true;
        mountRef.current?.dispose();
        mountRef.current = null;
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
