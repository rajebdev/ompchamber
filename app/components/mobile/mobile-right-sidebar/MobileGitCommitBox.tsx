import React from 'react';

interface MobileGitCommitBoxProps {
  message: string;
  hasStagedChanges: boolean;
  onChangeMessage: (msg: string) => void;
  onCommit: () => void;
}

export function MobileGitCommitBox({
  message,
  hasStagedChanges,
  onChangeMessage,
  onCommit
}: MobileGitCommitBoxProps) {
  return (
    <div className="p-3 border-b border-ink/10 bg-paper flex-shrink-0">
      <textarea
        placeholder="Message (Ctrl+Enter to commit)"
        value={message}
        onChange={(e) => onChangeMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 'Enter' && message.trim() && hasStagedChanges) {
            onCommit();
          }
        }}
        className="w-full bg-paper border border-ink/20 rounded text-xs p-2 focus:outline-none focus:border-ink/40 focus:ring-1 focus:ring-ink/10 transition-all resize-none h-16 text-ink placeholder-ink/30"
      />
      <button
        type="button"
        onClick={onCommit}
        disabled={!message.trim() || !hasStagedChanges}
        className="mt-2 w-full bg-ink text-paper text-xs font-medium py-1.5 rounded hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        Commit
      </button>
    </div>
  );
}
