import { useCallback, useState } from 'preact/hooks';

interface PendingUndo {
  id: string;
  content: string;
}

/**
 * Own the confirmation gate between a message-footer click and undo, holding
 * the modal open (and exposing a loading state) until the undo settles.
 *
 * A refusal is a RESULT, not a silent stay-open: the rewind endpoint answers
 * 400 with a reason (the entry is not in the session file, the turn is not a
 * user message) and the old contract turned that into a modal that simply never
 * closed — indistinguishable from a slow request. The failure text is kept here
 * so the dialog can say what happened; the precise server reason is reported
 * separately by the caller's own error channel.
 */
export function useUndoConfirmation(onUndo: (id: string, content: string) => Promise<boolean>) {
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestUndo = useCallback((id: string, content?: string) => {
    setError(null);
    setPendingUndo({ id, content: content ?? '' });
  }, []);
  const closeUndoConfirm = useCallback(() => {
    setPendingUndo(null);
    setError(null);
  }, []);
  const confirmUndo = useCallback(async () => {
    if (!pendingUndo || undoing) return;
    setUndoing(true);
    setError(null);
    const ok = await onUndo(pendingUndo.id, pendingUndo.content);
    // On success the timeline already reflects the rewind — close the modal.
    // On failure keep it open WITH the reason so the user can retry or cancel.
    if (ok) setPendingUndo(null);
    else setError('Undo failed — the session was not rewound. The turn is still in the timeline.');
    setUndoing(false);
  }, [onUndo, pendingUndo, undoing]);

  return { pendingUndo, undoing, error, requestUndo, closeUndoConfirm, confirmUndo };
}
