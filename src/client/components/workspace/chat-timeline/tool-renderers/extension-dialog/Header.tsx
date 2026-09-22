import type { ReactNode } from 'preact/compat';
import { Sparkles, X } from 'lucide-preact';

interface ExtensionDialogHeaderProps {
  title?: string;
  methodLabel: string;
  badge: string;
  icon: ReactNode;
  onCancel: () => void;
}

export function ExtensionDialogHeader({
  title,
  methodLabel,
  badge,
  icon,
  onCancel,
}: ExtensionDialogHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-ink/8 bg-canvas/40 px-5 py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/12 bg-paper text-ink shadow-xs">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-ink">
              {title || methodLabel}
            </h3>
            <span className="flex items-center gap-1 rounded-full border border-ink/10 bg-paper px-2 py-0.5 font-mono text-[9px] font-medium tracking-wider text-ink/60 uppercase">
              <Sparkles size={9} className="text-ink/40" />
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink/50">
            Autonomous agent inquiry requiring user confirmation
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        aria-label="Close dialog (Esc)"
        title="Cancel (Esc)"
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-ink/10 text-ink/45 transition-colors hover:border-ink/25 hover:bg-ink/5 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}
