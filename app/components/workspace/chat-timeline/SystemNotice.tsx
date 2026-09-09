import { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';

interface SystemNoticeProps {
  notice: string;
}

/** System notice collapsible — baris 1 judul, sisanya hasil scrollable.
 *  Tertutup secara default, dibuka dengan klik (pola ToolCallCard). */
export function SystemNotice({ notice }: SystemNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const lines = notice.split(/\r?\n/);
  const firstLine = (lines.find((l) => l.trim()) ?? '').trim();
  const restStart = lines.findIndex((l) => l.trim() === firstLine);
  const rest = lines.slice(restStart + 1).join('\n').trim();

  return (
    <div className="mx-3 overflow-hidden rounded-xl border border-ink/10 bg-paper text-[12px] text-ink transition-colors hover:border-ink/20 select-text">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10">
          <Info size={13} className="text-ink/70" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink/50">
            System Notice
          </span>
          <span className="block truncate text-[12px] font-medium text-ink">
            {firstLine || notice}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink/35 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && rest && (
        <pre className="max-h-56 overflow-auto border-t border-ink/8 bg-canvas/40 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/75 scrollbar-overlay-container scrollbar-overlay-static">
          {rest}
        </pre>
      )}
    </div>
  );
}
