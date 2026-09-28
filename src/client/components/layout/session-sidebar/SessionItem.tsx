import type { TargetedMouseEvent } from 'preact';
import { Check, ChevronDown, ChevronRight, CircleQuestionMark, Loader2, MoreHorizontal } from 'lucide-preact';
import { useInlineRename } from '@/client/hooks/ui/inline-rename';
import { SessionActionsMenu, useRowMenu } from '@/client/components/common/session-actions-menu';

export interface SessionItemProps {
  title: string;
  isActive?: boolean;
  isArchived?: boolean;
  status?: 'stream' | 'finish' | 'abort';
  /** The session's agent is blocked on a question until the user answers it. */
  awaitingInput?: boolean;
  onClick?: () => void;
  onArchive?: () => void;
  /** Omitted for a session that cannot be deleted yet (a pending `new-…` chat,
   *  which has no transcript anywhere). */
  onDelete?: () => void;
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
  onDelete,
  onRename,
  expandable = false,
  isExpanded = false,
  hasSubagents = false,
  onToggleExpand,
}: SessionItemProps) {
  const showChevron = Boolean(expandable && hasSubagents && onToggleExpand);
  // The slot shows one glyph, never two side by side. A live run signal owns
  // it at rest — the spinner, or the blocked-on-a-question cue, which says it
  // is YOUR turn. With nothing live to report the chevron is PINNED, collapsed
  // or expanded: it is the only affordance left worth showing, and making it
  // hover-only would leave the roster reachable only by hovering exactly the
  // right 16px.
  const liveRun = awaitingInput || status === 'stream';
  const chevronPinned = showChevron && !liveRun;
  const showStatus = Boolean(awaitingInput || status) && !chevronPinned;
  const {
    isEditing,
    draft,
    setDraft,
    inputRef,
    startRename,
    handleKeyDown,
    handleBlur,
  } = useInlineRename(title, onRename);
  // One trigger for every row action; also reachable by right-clicking the row.
  const menu = useRowMenu();
  const hasActions = Boolean(onRename || onArchive || onDelete);

  return (
    <>
      <div
        onClick={isEditing ? undefined : onClick}
        onContextMenu={hasActions && !isEditing ? menu.openAtCursor : undefined}
        className={`group/item relative flex items-center w-full rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors select-none ${
          isActive
            ? 'bg-ink/10 font-medium text-ink'
            : 'text-ink/75 hover:text-ink hover:bg-ink/5'
        }`}
      >
        {/* One 16px slot owns both icons — never two side by side. A live run
            signal (blocked question, run spinner) holds the slot; otherwise the
            chevron is pinned, collapsed or expanded. While the signal holds it,
            hovering hands the slot to the chevron so the roster stays reachable
            mid-run.
            Both layers are pointer-inert for the opposite state: the toggle
            while hidden, the status glyph ALWAYS (it is painted after the
            toggle, so without that it wins the hit test over the revealed
            chevron and every click on a badged row selects the session instead
            of expanding it). */}
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
              className={`peer absolute inset-0 flex items-center justify-center rounded cursor-pointer transition-opacity ${
                chevronPinned
                  ? 'text-ink/60 hover:text-ink'
                  : 'text-ink/40 hover:text-ink pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 focus-visible:opacity-100'
              }`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          {showStatus && (
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

        {/* One trigger, whatever the row can do. The three side-by-side hover
            icons this replaced cost a third of the title's width in a 268px
            sidebar, and each further action took another slice — the menu grows
            instead. Revealed on hover/focus; a right-click anywhere on the row
            opens the same menu. */}
        {!isEditing && hasActions && (
          <button
            type="button"
            onClick={menu.openBelow}
            title="Session actions"
            aria-label="Session actions"
            aria-haspopup="menu"
            aria-expanded={menu.anchor !== null}
            className="shrink-0 p-1 text-ink/40 hover:text-ink hover:bg-ink/10 rounded cursor-pointer transition-opacity opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal size={14} />
          </button>
        )}

      </div>

      {menu.anchor && (
        <SessionActionsMenu
          anchor={menu.anchor}
          isArchived={isArchived}
          onRename={onRename ? startRename : undefined}
          onArchive={onArchive}
          onDelete={onDelete}
          onClose={menu.close}
        />
      )}
    </>
  );
}
