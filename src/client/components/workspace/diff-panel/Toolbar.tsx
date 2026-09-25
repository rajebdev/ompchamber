import { AlignJustify, Check, Code2, Columns, Copy, Minus, Plus, RefreshCw, Space, Undo2 } from 'lucide-preact';
import { FileIcon } from '@/client/components/common/file-icon';
import { getGitStatusInfo } from '@/shared/lib/fs/git-status';

export type DiffViewMode = 'unified' | 'split';

interface DiffToolbarProps {
  filePath: string;
  status: string;
  isStaged: boolean;
  viewMode: DiffViewMode;
  ignoreWhitespace: boolean;
  additions: number;
  deletions: number;
  isLoading: boolean;
  isCopied: boolean;
  /** A stage/unstage/discard write is in flight; the toolbar locks its actions. */
  isBusy?: boolean;
  onSetViewMode: (mode: DiffViewMode) => void;
  onToggleWhitespace: () => void;
  onStageUnstage: () => void;
  onDiscard: () => void;
  onOpenInEditor?: () => void;
  onRefresh: () => void;
  onCopyDiff: () => void;
}

const ACTION_CLASS =
  'flex items-center justify-center p-1.5 rounded transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink/50';

export function DiffToolbar({
  filePath,
  status,
  isStaged,
  viewMode,
  ignoreWhitespace,
  additions,
  deletions,
  isLoading,
  isCopied,
  isBusy = false,
  onSetViewMode,
  onToggleWhitespace,
  onStageUnstage,
  onDiscard,
  onOpenInEditor,
  onRefresh,
  onCopyDiff,
}: DiffToolbarProps) {
  const fileName = filePath.split('/').pop() || filePath;
  const statusInfo = getGitStatusInfo(status, isStaged);
  // Only the actions that write to git lock while one is in flight. Copying the
  // diff is a local read of what is already on screen, so it stays available.
  const locked = isLoading || isBusy;

  return (
    // `@container` so the labels below can hide on a NARROW PANEL rather than a
    // narrow viewport: the editor panel is 320px wide on a 1440px screen, and
    // `sm:` (viewport-keyed) kept every label on, overflowing the toolbar.
    <div className="@container flex items-center justify-between px-3 py-1.5 bg-paper border-b border-ink/10 text-xs font-sans select-none flex-shrink-0 gap-2 min-w-0">
      {/* Left: File name and status badge. Hidden when the panel is narrow —
          the editor tab already carries the name and the status character, and
          the mobile diff header carries both. */}
      <div className="hidden @[560px]:flex items-center space-x-2 min-w-0 pr-2">
        <FileIcon name={fileName} size={14} className="flex-shrink-0" />
        <span className="font-mono text-ink font-medium truncate" title={filePath}>
          {fileName}
        </span>

        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${statusInfo.badgeBgClass} flex-shrink-0`}>
          {statusInfo.charStatus} {statusInfo.label}
        </span>
      </div>

      {/* Right: Controls & actions. `ml-auto` keeps them right-aligned where the
          identity block is hidden. This strip scrolls on its own when the panel
          is too narrow, so no action is ever clipped out of reach. Each segment
          sets its OWN mode — toggling meant clicking the already-active segment
          flipped the view to the other one. */}
      <div className="flex items-center space-x-0.5 @[440px]:space-x-1 text-ink/70 ml-auto min-w-0 overflow-x-auto no-scrollbar">
        {/* Change counts live here, not in the identity block: the editor tab
            carries the file name but never the counts, so this is the one piece
            of the header that must survive a narrow panel. */}
        {(additions > 0 || deletions > 0) && (
          <div className="flex items-center space-x-1.5 text-[11px] font-mono flex-shrink-0 pr-1.5 mr-0.5 @[440px]:mr-1 border-r border-ink/10">
            {additions > 0 && <span className="text-success font-semibold">+{additions}</span>}
            {deletions > 0 && <span className="text-error font-semibold">-{deletions}</span>}
          </div>
        )}

        {/* View mode toggle (Unified vs Split) */}
        <div className="flex items-center bg-canvas rounded border border-ink/15 p-0.5 mr-0.5 @[440px]:mr-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onSetViewMode('split')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer flex-shrink-0 ${
              viewMode === 'split' ? 'bg-paper text-ink shadow-xs' : 'text-ink/60 hover:text-ink'
            }`}
            title="Split (side-by-side) diff"
            aria-label="Split (side-by-side) diff"
            aria-pressed={viewMode === 'split'}
          >
            <Columns size={12} />
            <span className="hidden @[420px]:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={() => onSetViewMode('unified')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer flex-shrink-0 ${
              viewMode === 'unified' ? 'bg-paper text-ink shadow-xs' : 'text-ink/60 hover:text-ink'
            }`}
            title="Unified diff"
            aria-label="Unified diff"
            aria-pressed={viewMode === 'unified'}
          >
            <AlignJustify size={12} />
            <span className="hidden @[420px]:inline">Unified</span>
          </button>
        </div>

        {/* Ignore whitespace toggle */}
        <button
          type="button"
          onClick={onToggleWhitespace}
          className={`p-1.5 rounded transition-colors cursor-pointer flex-shrink-0 ${
            ignoreWhitespace ? 'bg-ink/10 text-ink' : 'text-ink/50 hover:text-ink hover:bg-ink/5'
          }`}
          title={ignoreWhitespace ? 'Whitespace changes hidden' : 'Hide whitespace changes'}
          aria-label={ignoreWhitespace ? 'Whitespace changes hidden' : 'Hide whitespace changes'}
          aria-pressed={ignoreWhitespace}
        >
          <Space size={13} />
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          className={`${ACTION_CLASS} text-ink/50 hover:text-ink hover:bg-ink/5 flex-shrink-0`}
          title="Reload this diff"
          aria-label="Reload this diff"
          disabled={locked}
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* Copy diff — never disabled: it reads the buffer already on screen. */}
        <button
          type="button"
          onClick={onCopyDiff}
          className={`${ACTION_CLASS} text-ink/50 hover:text-ink hover:bg-ink/5 flex-shrink-0`}
          title={isCopied ? 'Copied' : 'Copy diff text'}
          aria-label={isCopied ? 'Copied' : 'Copy diff text'}
        >
          {isCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>

        {/* Discard changes */}
        {!isStaged && (
          <button
            type="button"
            onClick={onDiscard}
            className={`${ACTION_CLASS} text-ink/50 hover:text-error hover:bg-error/10 flex-shrink-0`}
            title="Discard changes in this file"
            aria-label="Discard changes in this file"
            disabled={locked}
          >
            <Undo2 size={13} />
          </button>
        )}

        {/* Stage / Unstage button */}
        <button
          type="button"
          onClick={onStageUnstage}
          className="px-2 py-1 text-[11px] font-medium rounded border border-ink/15 hover:bg-ink/5 flex items-center space-x-1 transition-colors text-ink cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0"
          title={isStaged ? 'Unstage file' : 'Stage file'}
          aria-label={isStaged ? 'Unstage file' : 'Stage file'}
          disabled={locked}
        >
          {isStaged ? (
            <>
              <Minus size={12} />
              <span className="hidden @[360px]:inline">Unstage</span>
            </>
          ) : (
            <>
              <Plus size={12} />
              <span className="hidden @[360px]:inline">Stage</span>
            </>
          )}
        </button>

        {/* Switch to normal code editor */}
        {onOpenInEditor && (
          <button
            type="button"
            onClick={onOpenInEditor}
            className="px-2 py-1 text-[11px] font-medium rounded bg-ink text-canvas hover:bg-ink/90 flex items-center space-x-1 transition-colors shadow-xs ml-1 cursor-pointer flex-shrink-0"
            title="Open in code editor"
            aria-label="Open in code editor"
          >
            <Code2 size={12} />
            <span className="hidden @[360px]:inline">Edit File</span>
          </button>
        )}
      </div>
    </div>
  );
}
