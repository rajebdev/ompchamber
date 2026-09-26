import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, Loader2, Pencil } from 'lucide-preact';
import type { SessionItemData } from '@/shared/types';
import { useInlineRename } from '@/client/hooks/ui/inline-rename';

export interface MobileSessionRowProps {
  session: SessionItemData;
  isActive: boolean;
  status?: 'stream' | 'finish' | 'abort';
  /** Relative age of the session, or null when no usable timestamp exists. */
  timeAgo: string | null;
  /** The session has a subagent roster (on disk or live), so it can be expanded. */
  hasSubagents?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect: () => void;
  onArchive: () => void;
  onRename?: (name: string) => void;
}

export function MobileSessionRow({
  session,
  isActive,
  status,
  timeAgo,
  hasSubagents = false,
  isExpanded = false,
  onToggleExpand,
  onSelect,
  onArchive,
  onRename,
}: MobileSessionRowProps) {
  const {
    isEditing,
    draft,
    setDraft,
    inputRef,
    startRename,
    handleKeyDown,
    handleBlur,
  } = useInlineRename(session.title, onRename);

  // The roster toggle is the row's LAST element, so its glyph lands in the same
  // column as the folder header's expand chevron — one vertical line of
  // disclosure controls down the drawer. The toggle is a SIBLING of the select
  // button, never a child: a button inside a button is invalid and the browser
  // reparents it.
  //
  // Touch has no hover to reveal a hidden toggle the way desktop does, so it is
  // pinned whenever the row has a roster; a hidden one would leave the roster
  // unreachable on a phone.
  const showChevron = hasSubagents && Boolean(onToggleExpand);
  const showStatus = Boolean(status);
  const title = session.title.charAt(0).toUpperCase() + session.title.slice(1);

  if (isEditing) {
    return (
      <div className="w-full rounded-lg flex items-center bg-ink/10">
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="flex-1 min-w-0 mx-2 my-1.5 bg-paper border border-ink/25 rounded px-2 py-1 text-xs text-ink outline-none focus:border-ink/50"
        />
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-lg flex items-center transition-colors ${
        isActive ? 'bg-ink/10 font-medium text-ink' : 'hover:bg-ink/5 text-ink/85'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 text-left pl-2 pr-3 py-2 flex items-center justify-between min-w-0"
      >
        <div className="flex items-center min-w-0 pr-2">
          {/* Status slot, 16px at the same x as the folder header's icon slot,
              so the left column reads as one line. */}
          <span className="w-4 flex-shrink-0 flex items-center justify-center">
            {showStatus && status === 'stream' && <Loader2 size={13} className="text-ink/50 animate-spin" />}
            {showStatus && (status === 'finish' || status === 'abort') && <Check size={13} className="text-ink/50" />}
          </span>
          <span className="text-xs truncate leading-snug ml-2">{title}</span>
        </div>

        <span className="text-[11px] text-ink/45 font-mono flex-shrink-0 ml-2">{timeAgo ?? ''}</span>
      </button>

      {onRename && (
        <button
          type="button"
          onClick={startRename}
          title="Rename session"
          className="flex-shrink-0 p-2 text-ink/35 hover:text-ink rounded-lg cursor-pointer"
        >
          <Pencil size={14} />
        </button>
      )}

      <button
        type="button"
        onClick={onArchive}
        title={session.is_archived === 1 ? 'Unarchive session' : 'Archive session'}
        className="flex-shrink-0 p-2 text-ink/35 hover:text-ink rounded-lg cursor-pointer"
      >
        {session.is_archived === 1 ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </button>

      {/* Last element, so its glyph sits in the folder header's chevron column.
          `p-1.5 mr-1.5` centres a 14px glyph on that column while keeping a
          touch-sized tap target. */}
      {showChevron && (
        <button
          type="button"
          onClick={onToggleExpand}
          title={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
          className="flex-shrink-0 p-1.5 mr-1.5 flex items-center justify-center text-ink/50 hover:text-ink rounded-lg cursor-pointer"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
    </div>
  );
}
