import type { TargetedMouseEvent } from 'preact';
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, CircleQuestionMark, Loader2, Pencil } from 'lucide-preact';
import { useInlineRename } from '@/client/hooks/ui/inline-rename';

export interface SessionItemProps {
  title: string;
  isActive?: boolean;
  isArchived?: boolean;
  status?: 'stream' | 'finish' | 'abort';
  /** The session's agent is blocked on a question until the user answers it. */
  awaitingInput?: boolean;
  onClick?: () => void;
  onArchive?: () => void;
  onRename?: (name: string) => void;
  expandable?: boolean;
  isExpanded?: boolean;
  hasSubagents?: boolean;
  onToggleExpand?: (e: TargetedMouseEvent<HTMLElement>) => void;
}

export function SessionItem({
  title,
  isActive = false,
  isArchived = false,
  status,
  awaitingInput = false,
  onClick,
  onArchive,
  onRename,
  expandable = false,
  isExpanded = false,
  hasSubagents = false,
  onToggleExpand,
}: SessionItemProps) {
  const showChevron = Boolean(expandable && hasSubagents && onToggleExpand);
  const {
    isEditing,
    draft,
    setDraft,
    inputRef,
    startRename,
    handleKeyDown,
    handleBlur,
  } = useInlineRename(title, onRename);

  return (
    <div
      onClick={isEditing ? undefined : onClick}
      className={`group/item relative flex items-center w-full rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors select-none ${
        isActive
          ? 'bg-ink/10 font-medium text-ink'
          : 'text-ink/75 hover:text-ink hover:bg-ink/5'
      }`}
    >
      {/* One 16px slot owns both icons: the run-status indicator (spinner /
          check) shows at rest, and the expand toggle takes the slot over on
          hover. Never two icons.
          The toggle is hover-reveal only, expanded or not: an open roster
          must not cost the row its run status, and the roster below already
          says the row is expanded. Both layers are pointer-inert for the
          opposite state — the toggle while hidden, the status glyph ALWAYS
          (it is painted after the toggle, so without that it wins the hit
          test over the revealed chevron and every click on a badged row
          selects the session instead of expanding it). */}
      <span className="relative w-4 h-4 shrink-0">
        {showChevron && onToggleExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(e);
            }}
            title={isExpanded ? 'Collapse subagents' : 'Expand subagents'}
            aria-expanded={isExpanded}
            className="peer absolute inset-0 flex items-center justify-center rounded cursor-pointer text-ink/40 transition-opacity hover:text-ink pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 focus-visible:opacity-100"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
        {(awaitingInput || status) && (
          <span
            className={`pointer-events-none absolute inset-0 flex items-center justify-center text-ink/60 transition-opacity ${
              showChevron ? 'group-hover/item:opacity-0 peer-focus-visible:opacity-0' : ''
            }`}
          >
            {/* Waiting on an answer outranks the run spinner: the spinner says
                work is happening, the question mark says it is YOUR turn. */}
            {awaitingInput ? (
              <CircleQuestionMark size={12} className="animate-pulse text-ink/80" />
            ) : status === 'stream' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
          </span>
        )}
      </span>

      {/* Gap between icon and text */}
      <span className="w-2 shrink-0" />

      {/* Session Title - aligned straight with Folder Name */}
      {isEditing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="flex-1 min-w-0 bg-paper border border-ink/25 rounded px-1 py-0.5 text-xs text-ink outline-none focus:border-ink/50"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate leading-snug">
          {title.charAt(0).toUpperCase() + title.slice(1)}
        </span>
      )}

      {/* Quick Actions: Rename / Archive on Hover */}
      {!isEditing && (onRename || onArchive) && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
          {onRename && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
              title="Rename session"
              className="p-1 text-ink/40 hover:text-ink bg-paper/90 hover:bg-ink/10 rounded shadow-xs cursor-pointer"
            >
              <Pencil size={12} />
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title={isArchived ? 'Unarchive session' : 'Archive session'}
              className="p-1 text-ink/40 hover:text-ink bg-paper/90 hover:bg-ink/10 rounded shadow-xs cursor-pointer"
            >
              {isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
