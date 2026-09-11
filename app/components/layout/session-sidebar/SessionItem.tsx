import type { MouseEvent } from 'react';
import { 
  Archive, 
  ArchiveRestore, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronRight,
} from 'lucide-react';

export interface SessionItemProps {
  title: string;
  isActive?: boolean;
  isArchived?: boolean;
  status?: 'processing' | 'done';
  onClick?: () => void;
  onArchive?: () => void;
  expandable?: boolean;
  isExpanded?: boolean;
  hasSubagents?: boolean;
  onToggleExpand?: (e: MouseEvent) => void;
}

export function SessionItem({
  title,
  isActive = false,
  isArchived = false,
  status,
  onClick,
  onArchive,
  expandable = false,
  isExpanded = false,
  hasSubagents = false,
  onToggleExpand,
}: SessionItemProps) {
  const showChevron = Boolean(expandable && hasSubagents && onToggleExpand);

  return (
    <div
      onClick={onClick}
      className={`group/item relative flex items-center w-full rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors select-none ${
        isActive
          ? 'bg-ink/10 font-medium text-ink'
          : 'text-ink/75 hover:text-ink hover:bg-ink/5'
      }`}
    >
      {/* Chevron or status indicator in a fixed w-4 slot aligned with Folder Icon */}
      <span className="w-4 h-4 flex items-center justify-center shrink-0">
        {showChevron && onToggleExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(e);
            }}
            title={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
            aria-expanded={isExpanded}
            className="w-full h-full flex items-center justify-center text-ink/40 hover:text-ink rounded cursor-pointer transition-colors"
          >
            {isExpanded ? <ChevronDown size={13} className="text-ink/70" /> : <ChevronRight size={13} />}
          </button>
        ) : status === 'processing' ? (
          <Loader2 size={12} className="animate-spin text-ink/60" />
        ) : status === 'done' ? (
          <Check size={12} className="text-ink/60" />
        ) : null}
      </span>

      {/* Gap between icon and text */}
      <span className="w-2 shrink-0" />

      {/* Session Title - aligned straight with Folder Name */}
      <span className="flex-1 min-w-0 truncate leading-snug">
        {title.charAt(0).toUpperCase() + title.slice(1)}
      </span>

      {/* Quick Action: Archive / Unarchive Button on Hover */}
      {onArchive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          title={isArchived ? 'Unarchive session' : 'Archive session'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-ink/40 hover:text-ink bg-paper/90 hover:bg-ink/10 rounded opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer shadow-xs"
        >
          {isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
        </button>
      )}
    </div>
  );
}
