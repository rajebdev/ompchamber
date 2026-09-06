import React, { useRef, useEffect } from 'react';
import { CornerDownLeft, Square, Loader2 } from 'lucide-react';

interface TerminalInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  isRunning: boolean;
  cwd: string;
}

export function TerminalInputBar({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onCancel,
  isRunning,
  cwd,
}: TerminalInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRunning) {
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-2 border-t border-[#141310]/10 bg-[#faf8f3] flex items-center space-x-2 flex-shrink-0"
    >
      <div className="flex items-center space-x-1.5 flex-1 min-w-0 bg-[#f4f1ea] border border-[#141310]/20 rounded-lg px-2.5 py-1.5 focus-within:border-[#141310]/50 transition-colors">
        <span className="text-[#141310]/50 font-mono text-xs select-none font-bold">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isRunning}
          placeholder={isRunning ? "Command is executing..." : "bun run build, git status, ls -la..."}
          className="flex-1 bg-transparent font-mono text-xs text-[#141310] placeholder-[#141310]/40 outline-none min-w-0"
        />
      </div>

      {isRunning ? (
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg bg-[#c8321e] text-white hover:bg-[#c8321e]/90 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-xs"
          title="Interrupt process (Ctrl+C)"
        >
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim()}
          className="p-2 rounded-lg bg-[#141310] text-[#f4f1ea] hover:bg-[#141310]/80 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
          title="Execute command (Enter)"
        >
          <CornerDownLeft size={13} />
        </button>
      )}
    </form>
  );
}
