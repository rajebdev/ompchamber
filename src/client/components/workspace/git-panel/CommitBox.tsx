import { Check } from 'lucide-preact';

interface GitCommitBoxProps {
  message: string;
  hasStagedChanges: boolean;
  isBusy?: boolean;
  onChangeMessage: (value: string) => void;
  onCommit: () => void;
}

export function GitCommitBox({
  message,
  hasStagedChanges,
  isBusy = false,
  onChangeMessage,
  onCommit,
}: GitCommitBoxProps) {
  const canCommit = hasStagedChanges && message.trim().length > 0 && !isBusy;

  return (
    <div className="border-t border-ink/10 bg-canvas/50 p-3 flex flex-col gap-2">
      <textarea
        value={message}
        onChange={(e) => onChangeMessage(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit) {
            e.preventDefault();
            onCommit();
          }
        }}
        placeholder="Commit message (⌘/Ctrl+Enter to commit)"
        rows={5}
        className="w-full resize-y min-h-[100px] max-h-[200px] bg-paper border border-ink/20 rounded px-2.5 py-1.5 text-xs text-ink placeholder-ink/40 focus:outline-none focus:border-ink/40 transition-colors font-mono"
      />

      <button
        type="button"
        onClick={onCommit}
        disabled={!canCommit}
        title={hasStagedChanges ? 'Commit staged changes' : 'Stage changes first'}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-ink text-canvas hover:bg-ink/90 transition-colors cursor-pointer text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Check size={12} />
        Commit
      </button>
    </div>
  );
}
