import { useEffect } from 'react';
import { Undo2 } from 'lucide-react';

interface UndoConfirmModalProps {
  /** Preview of the message being undone (truncated by the caller). */
  content: string;
  /** Omp rewinds agent context; other session types only trim the timeline. */
  isOmpSession: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for the undo button on a user-message footer. Undo
 * rewinds the session before this turn — the turn and everything after it
 * leave the timeline and the agent context — so the user should opt in.
 */
export function UndoConfirmModal({ content, isOmpSession, onClose, onConfirm }: UndoConfirmModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 animate-in fade-in duration-200 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm undo"
    >
      <div
        className="bg-paper border border-ink/20 rounded-xl shadow-xl w-[min(94vw,420px)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink/10">
          <Undo2 size={16} className="text-ink/70 shrink-0" />
          <h2 className="text-[13px] font-semibold text-ink">Undo message?</h2>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="rounded-lg border border-ink/10 bg-canvas/50 px-3 py-2 text-[12px] text-ink/80 leading-relaxed max-h-28 overflow-y-auto scrollbar-overlay-container">
            {content || 'Empty message or attachment-only prompt'}
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink/60">
            {isOmpSession
              ? 'The timeline and agent context rewind to before this message. Its reply and everything after it are removed; the text returns to the composer for editing.'
              : 'This message and everything after it are removed from the timeline. The text returns to the composer for editing.'}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ink/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-ink/20 text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors cursor-pointer text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-ink text-canvas hover:bg-ink/90 transition-colors cursor-pointer text-xs font-medium"
          >
            Undo
          </button>
        </div>
      </div>
    </div>
  );
}
