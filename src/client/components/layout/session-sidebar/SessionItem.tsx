import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedMouseEvent } from 'preact';
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, Loader2, Pencil } from 'lucide-preact';

export interface SessionItemProps {
  title: string;
  isActive?: boolean;
  isArchived?: boolean;
  status?: 'stream' | 'finish' | 'abort' | 'error';
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
  onClick,
  onArchive,
  onRename,
  expandable = false,
  isExpanded = false,
  hasSubagents = false,
  onToggleExpand,
}: SessionItemProps) {
  const showChevron = Boolean(expandable && hasSubagents && onToggleExpand);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape flips this so the ensuing blur is a no-op (no accidental commit).
  const cancelRef = useRef(false);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const startRename = () => {
    cancelRef.current = false;
    setDraft(title);
    setIsEditing(true);
  };

  const commitRename = () => {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === title) return;
    onRename?.(trimmed);
  };

  const cancelRename = () => {
    cancelRef.current = true;
    setIsEditing(false);
  };

  return (
    <div
      onClick={isEditing ? undefined : onClick}
      className={`group/item relative flex items-center w-full rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors select-none ${
        isActive
          ? 'bg-ink/10 font-medium text-ink'
          : 'text-ink/75 hover:text-ink hover:bg-ink/5'
      }`}
    >
      {/* Chevron in its own slot; the run-status indicator rides a second
          slot so a session that has subagents still shows its spinner/check. */}
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
        ) : status ? (
          status === 'stream' ? (
            <Loader2 size={12} className="animate-spin text-ink/60" />
          ) : (
            <Check size={12} className="text-ink/60" />
          )
        ) : null}
      </span>
      {showChevron && onToggleExpand && status && (
        <span className="w-4 h-4 flex items-center justify-center shrink-0 -ml-1">
          {status === 'stream' ? (
            <Loader2 size={12} className="animate-spin text-ink/60" />
          ) : (
            <Check size={12} className="text-ink/60" />
          )}
        </span>
      )}

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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={() => {
            if (cancelRef.current) {
              cancelRef.current = false;
              return;
            }
            commitRename();
          }}
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
