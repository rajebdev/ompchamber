import { 
  Columns, 
  AlignJustify, 
  Space, 
  Plus, 
  Minus, 
  Undo2, 
  Code2, 
  Copy, 
  Check, 
  RefreshCw 
} from 'lucide-react';
import { FileIcon } from '@/components/common/FileIcon';
import { getGitStatusInfo } from '@/lib/fs/git-status';

interface DiffToolbarProps {
  filePath: string;
  status: string;
  isStaged: boolean;
  viewMode: 'unified' | 'split';
  ignoreWhitespace: boolean;
  additions: number;
  deletions: number;
  isLoading: boolean;
  isCopied: boolean;
  onToggleViewMode: () => void;
  onToggleWhitespace: () => void;
  onStageUnstage: () => void;
  onDiscard: () => void;
  onOpenInEditor?: () => void;
  onRefresh: () => void;
  onCopyDiff: () => void;
}

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
  onToggleViewMode,
  onToggleWhitespace,
  onStageUnstage,
  onDiscard,
  onOpenInEditor,
  onRefresh,
  onCopyDiff,
}: DiffToolbarProps) {
  const fileName = filePath.split('/').pop() || filePath;
  const statusInfo = getGitStatusInfo(status, isStaged);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-paper border-b border-ink/10 text-xs font-sans select-none flex-shrink-0">
      {/* Left: File name, status badge, additions/deletions */}
      <div className="flex items-center space-x-2 min-w-0 pr-2">
        <FileIcon name={fileName} size={14} className="flex-shrink-0" />
        <span className="font-mono text-ink font-medium truncate" title={filePath}>
          {fileName}
        </span>
        
        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${statusInfo.badgeBgClass} flex-shrink-0`}>
          {statusInfo.charStatus} {statusInfo.label}
        </span>

        {(additions > 0 || deletions > 0) && (
          <div className="flex items-center space-x-1.5 text-[11px] font-mono flex-shrink-0 ml-1">
            {additions > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{additions}</span>}
            {deletions > 0 && <span className="text-error font-medium">-{deletions}</span>}
          </div>
        )}
      </div>

      {/* Right: Controls & actions */}
      <div className="flex items-center space-x-1 text-ink/70 flex-shrink-0">
        {/* View mode toggle (Unified vs Split) */}
        <div className="flex items-center bg-canvas rounded border border-ink/15 p-0.5 mr-1">
          <button
            type="button"
            onClick={onToggleViewMode}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'split' ? 'bg-paper text-ink shadow-xs' : 'text-ink/60 hover:text-ink'
            }`}
            title="Split (side-by-side) Diff"
          >
            <Columns size={12} />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={onToggleViewMode}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'unified' ? 'bg-paper text-ink shadow-xs' : 'text-ink/60 hover:text-ink'
            }`}
            title="Unified Diff"
          >
            <AlignJustify size={12} />
            <span className="hidden sm:inline">Unified</span>
          </button>
        </div>

        {/* Ignore whitespace toggle */}
        <button
          type="button"
          onClick={onToggleWhitespace}
          className={`p-1.5 rounded transition-colors ${
            ignoreWhitespace ? 'bg-ink/10 text-ink' : 'text-ink/50 hover:text-ink hover:bg-ink/5'
          }`}
          title={ignoreWhitespace ? 'Whitespace ignored' : 'Ignore whitespace'}
        >
          <Space size={13} />
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          className="p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5 rounded transition-colors"
          title="Refresh Diff"
          disabled={isLoading}
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* Copy diff */}
        <button
          type="button"
          onClick={onCopyDiff}
          className="p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5 rounded transition-colors"
          title="Copy Diff Text"
        >
          {isCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
        </button>

        {/* Discard changes */}
        {!isStaged && (
          <button
            type="button"
            onClick={onDiscard}
            className="p-1.5 text-ink/50 hover:text-error hover:bg-error/10 rounded transition-colors"
            title="Discard changes in this file"
          >
            <Undo2 size={13} />
          </button>
        )}

        {/* Stage / Unstage button */}
        <button
          type="button"
          onClick={onStageUnstage}
          className="px-2 py-1 text-[11px] font-medium rounded border border-ink/15 hover:bg-ink/5 flex items-center space-x-1 transition-colors text-ink"
          title={isStaged ? 'Unstage file' : 'Stage file'}
        >
          {isStaged ? (
            <>
              <Minus size={12} />
              <span>Unstage</span>
            </>
          ) : (
            <>
              <Plus size={12} />
              <span>Stage</span>
            </>
          )}
        </button>

        {/* Switch to normal code editor */}
        {onOpenInEditor && (
          <button
            type="button"
            onClick={onOpenInEditor}
            className="px-2 py-1 text-[11px] font-medium rounded bg-ink text-canvas hover:bg-ink/90 flex items-center space-x-1 transition-colors shadow-xs ml-1"
            title="Open in Code Editor"
          >
            <Code2 size={12} />
            <span className="hidden sm:inline">Edit File</span>
          </button>
        )}
      </div>
    </div>
  );
}
