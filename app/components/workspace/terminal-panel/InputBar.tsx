import { useRef, useEffect, type KeyboardEvent, type FormEvent } from 'react';
import { CornerDownLeft, Square } from 'lucide-react';

interface TerminalInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  isRunning: boolean;
}

export function TerminalInputBar({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onCancel,
  isRunning,
}: TerminalInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isRunning) {
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-2 border-t border-ink/10 bg-paper flex items-center space-x-2 flex-shrink-0"
    >
      <div className="flex items-center space-x-2 flex-1 min-w-0 bg-canvas border border-ink/20 rounded-lg px-2.5 py-1.5 focus-within:border-ink/50 focus-within:ring-1 focus-within:ring-ink/10 transition-all">
        <span className="text-warning font-mono text-xs select-none font-bold">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isRunning}
          placeholder={isRunning ? "Command is executing in live session..." : "bun run build, git status, ls -la..."}
          className="flex-1 bg-transparent font-mono text-xs text-ink placeholder:text-ink/40 outline-none min-w-0"
        />
        <span className="hidden sm:inline-block text-[10px] font-mono text-ink/40 select-none">
          ↑↓ history
        </span>
      </div>

      {isRunning ? (
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg bg-error text-white hover:bg-error/90 active:scale-95 transition-all flex items-center space-x-1 cursor-pointer shadow-xs font-mono text-xs"
          title="Interrupt process (Ctrl+C)"
        >
          <Square size={12} fill="currentColor" />
          <span className="hidden xs:inline text-[10px]">Stop</span>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim()}
          className="p-2 rounded-lg bg-ink text-paper hover:bg-ink/85 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
          title="Execute command (Enter)"
        >
          <CornerDownLeft size={13} />
        </button>
      )}
    </form>
  );
}
