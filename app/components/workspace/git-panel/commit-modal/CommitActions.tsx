import type { GitCommit } from '@/types/git';

interface CommitActionsProps {
  commit: GitCommit;
  onAction: (action: string, commit: GitCommit, extra?: any) => void;
  isBusy?: boolean;
}

export function CommitActions({ commit, onAction, isBusy }: CommitActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 pb-2">
      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('checkout', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        checkout
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('create_branch_here', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        create branch here
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('cherry_pick', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        cherry-pick
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('revert', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        revert
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('reset', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        reset...
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('merge', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        merge into current
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          onAction('rebase', commit);
        }}
        className="px-2.5 py-1 text-[11px] font-mono rounded border border-ink/20 hover:bg-ink/5 text-ink/80 hover:text-ink transition-colors cursor-pointer disabled:opacity-40"
      >
        rebase onto this
      </button>
    </div>
  );
}
