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

  // Desktop's order: the roster toggle leads the row in the LEFT slot, ahead of
  // the run status. Desktop can reveal a hover-only chevron because a mouse has
  // hover; a touch screen does not, so the toggle is pinned whenever the row
  // has a roster — a hidden chevron would make the roster unreachable. A live
  // run therefore keeps its spinner in a second cell rather than displacing the
  // toggle.
  //
  // The toggle is a SIBLING of the select button, never a child: a button
  // inside a button is invalid and the browser reparents it.
  const showChevron = hasSubagents && Boolean(onToggleExpand);
  const showStatus = Boolean(status) && (!showChevron || status === 'stream');
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
      {/* Left slot, always 16px so every title starts at the same x. It holds
          the roster toggle ahead of the run status, desktop's order; the toggle
          is a SIBLING of the select button, never a child (a button inside a
          button is invalid and the browser reparents it). */}
      <span className="w-4 h-4 ml-2 flex-shrink-0 flex items-center justify-center">
        {showChevron && (
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
            className="w-4 h-4 flex items-center justify-center text-ink/60 hover:text-ink rounded cursor-pointer"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
      </span>

      <button
        type="button"
        onClick={onSelect}
        className="flex-1 text-left pl-1.5 pr-3 py-2 flex items-center justify-between min-w-0"
      >
        <div className="flex items-center min-w-0 pr-2">
          <span className="w-4 flex-shrink-0 flex items-center justify-center">
            {showStatus && status === 'stream' && <Loader2 size={13} className="text-ink/50 animate-spin" />}
            {showStatus && (status === 'finish' || status === 'abort') && <Check size={13} className="text-ink/50" />}
          </span>
          <span className="text-xs truncate leading-snug ml-1.5">{title}</span>
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
        className="flex-shrink-0 p-2 mr-1 text-ink/35 hover:text-ink rounded-lg cursor-pointer"
      >
        {session.is_archived === 1 ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </button>
    </div>
  );
}
