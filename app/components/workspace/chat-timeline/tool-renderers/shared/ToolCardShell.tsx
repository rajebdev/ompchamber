import { useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, AlertCircle, CircleSlash, Check } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface ToolCardShellProps {
  tool: ToolCallData;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
  children?: ReactNode;
}

function isSkippedTool(tool: ToolCallData): boolean {
  if (tool.synthetic === true || tool.status === 'skipped' || tool.status === 'aborted') return true;
  const details = tool.details as Record<string, any> | undefined;
  if (details?.__synthetic === true || details?.source === 'assistant_stop_skipped' || details?.executed === false) {
    return true;
  }
  return false;
}

function statusDot(status: ToolCallData['status'], isSkipped: boolean) {
  const base = 'h-1.5 w-1.5 rounded-full';
  if (status === 'running') return <span className={`${base} bg-ink/60 animate-pulse`} />;
  if (isSkipped) return <span className={`${base} bg-ink/30`} />;
  if (status === 'error') return <span className={`${base} bg-error`} />;
  return <span className={`${base} bg-success`} />;
}

function statusBadge(tool: ToolCallData) {
  const isSkipped = isSkippedTool(tool);
  if (isSkipped) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
        <CircleSlash size={10} /> Skipped
      </span>
    );
  }

  const status = tool.status || (tool.error ? 'error' : 'success');
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
        <AlertCircle size={10} /> Failed
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-semibold text-ink/60">
        <Loader2 size={10} className="animate-spin" /> Running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
      <Check size={10} /> Done
    </span>
  );
}

/** Shell card collapsible untuk semua tool call — header + body konsisten. */
export function ToolCardShell({
  tool,
  icon,
  title,
  subtitle,
  meta,
  isOpen: controlledIsOpen,
  onToggle,
  defaultExpanded = false,
  children,
}: ToolCardShellProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultExpanded);
  const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const status = tool.status || (tool.error ? 'error' : 'success');
  const isRunning = status === 'running';
  const hasBody = Boolean(children);

  const handleToggle = () => {
    if (!hasBody) return;
    if (onToggle) onToggle();
    else setInternalIsOpen((prev) => !prev);
  };

  const isSkipped = isSkippedTool(tool);

  return (
    <div
      className={`group overflow-hidden rounded-xl border transition-all duration-200 ${
        status === 'error' && !isSkipped
          ? 'border-error/25 bg-error/[0.03]'
          : isRunning
            ? 'border-ink/15 bg-paper'
            : isSkipped
              ? 'border-dashed border-ink/15 bg-paper/60 opacity-80'
              : 'border-ink/10 bg-paper hover:border-ink/20'
      } ${isExpanded ? 'shadow-sm' : ''}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={!hasBody}
        aria-expanded={isExpanded}
        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
          hasBody ? 'cursor-pointer hover:bg-ink/[0.03]' : 'cursor-default'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
            status === 'error' && !isSkipped
              ? 'bg-error/10 text-error'
              : isRunning
                ? 'bg-ink/8 text-ink'
                : 'bg-ink/5 text-ink/70 group-hover:bg-ink/8'
          }`}
        >
          {icon}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold tracking-tight text-ink">{title}</span>
            {statusDot(status, isSkipped)}
          </span>
          {subtitle && (
            <span className="truncate font-mono text-[10.5px] text-ink/45">{subtitle}</span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {meta}
          {statusBadge(tool)}
          {hasBody && (
            <ChevronDown
              size={14}
              className={`text-ink/35 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          )}
        </span>
      </button>

      {isExpanded && hasBody && (
        <div className="border-t border-ink/8 bg-canvas/40 px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
