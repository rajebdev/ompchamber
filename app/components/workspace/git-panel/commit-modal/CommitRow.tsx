import { useState } from 'react';
import { Copy, Check, ChevronRight, ChevronDown } from 'lucide-react';
import type { GitCommit, GitCommitFile } from '@/types/git';
import { CommitActions } from '@/components/workspace/git-panel/commit-modal/CommitActions';
import { CommitDiffViewer } from '@/components/workspace/git-panel/commit-modal/CommitDiffViewer';

interface CommitRowProps {
  commit: GitCommit;
  isSelected: boolean;
  isGraphMode: boolean;
  onSelect: (commit: GitCommit) => void;
  onAction: (action: string, commit: GitCommit, extra?: any) => void;
  onToggleFile: (commitHash: string, file: GitCommitFile) => void;
  isExpandedFile: (commitHash: string, filePath: string) => boolean;
  isLoadingFile: (commitHash: string, filePath: string) => boolean;
  fileDiffs: Record<string, string>;
  headerRef?: (el: HTMLDivElement | null) => void;
}

export function CommitRow({
  commit,
  isSelected,
  isGraphMode,
  onSelect,
  onAction,
  onToggleFile,
  isExpandedFile,
  isLoadingFile,
  fileDiffs,
  headerRef,
}: CommitRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyHash = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFile = (e: React.MouseEvent, file: GitCommitFile) => {
    e.stopPropagation();
    onToggleFile(commit.hash, file);
  };

  return (
    <div
      onClick={() => onSelect(commit)}
      className={`border-b border-ink/5 transition-colors cursor-pointer ${
        isSelected ? 'bg-ink/[0.03]' : 'hover:bg-ink/[0.015]'
      }`}
    >
      <div className="py-2.5 pr-4 pl-1 flex flex-col">
        {/* Commit Header Line */}
        <div className="flex flex-col gap-1">
          {/* Ref tags / Branch badges */}
          {commit.refs && commit.refs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {commit.refs.map((refTag, idx) => {
                const isStash = refTag.includes('stash');
                const isHead = refTag.includes('HEAD') || refTag.includes('main') || refTag.includes('master');
                return (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      isStash
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        : isHead
                        ? 'bg-ink/10 text-ink font-medium border-ink/20'
                        : 'bg-ink/5 text-ink/70 border-ink/10'
                    }`}
                  >
                    {refTag}
                  </span>
                );
              })}
            </div>
          )}

          {/* Subject message (Node dot anchor) */}
          <div
            ref={headerRef}
            className="text-[13px] font-semibold text-ink leading-snug break-words"
          >
            {commit.message}
          </div>

          {/* Metadata line: Author • Date • Hash with copy button */}
          <div className="flex items-center gap-2 text-[11px] text-ink/50 font-mono flex-wrap">
            <span>{commit.author}</span>
            <span>•</span>
            <span>{commit.date}</span>
            <span>•</span>
            <button
              type="button"
              onClick={handleCopyHash}
              title="Copy commit hash"
              className="inline-flex items-center gap-1 hover:text-ink transition-colors cursor-pointer text-ink/70"
            >
              <span>{commit.shortHash}</span>
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Action buttons (always visible when selected, or in graph mode when selected) */}
        {(isSelected || isGraphMode) && (
          <div className="mt-2">
            <CommitActions commit={commit} onAction={onAction} />
          </div>
        )}

        {/* Changed Files List */}
        {commit.files && commit.files.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {commit.files.map((file, fileIdx) => {
              const isExpanded = isExpandedFile(commit.hash, file.file);
              const diffKey = `${commit.hash}:${file.file}`;
              const activeDiff = fileDiffs[diffKey] || file.diff;
              const isLoading = isLoadingFile(commit.hash, file.file);

              const statusColor =
                file.status === 'A'
                  ? 'text-emerald-500 font-bold'
                  : file.status === 'D'
                  ? 'text-rose-500 font-bold'
                  : 'text-amber-500 font-bold';

              return (
                <div key={fileIdx} className="flex flex-col">
                  <div
                    onClick={(e) => handleToggleFile(e, file)}
                    className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-ink/5 text-[11.5px] font-mono text-ink/80 transition-colors group cursor-pointer"
                  >
                    {/* Status badge: M / A / D */}
                    <span className={`w-3 text-center flex-shrink-0 text-[11px] ${statusColor}`}>
                      {file.status || 'M'}
                    </span>

                    {/* File Path */}
                    <span className="truncate flex-1 min-w-0 text-ink/90 group-hover:text-ink">
                      {file.file}
                    </span>

                    {/* Stats: +3 / -2 */}
                    <span className="flex items-center gap-1 text-[10.5px] tabular-nums flex-shrink-0">
                      <span className="text-emerald-500">+{file.additions}</span>
                      <span className="text-ink/30">/</span>
                      <span className="text-rose-500">-{file.deletions}</span>
                    </span>

                    {/* Expand icon */}
                    <span className="text-ink/40 group-hover:text-ink flex-shrink-0">
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                  </div>

                  {/* Inline Diff Viewer when expanded */}
                  {isExpanded && (
                    <div className="pl-5 pr-1">
                      <CommitDiffViewer
                        diffText={activeDiff}
                        isLoading={isLoading}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
