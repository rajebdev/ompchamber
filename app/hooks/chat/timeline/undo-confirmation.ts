import { useCallback, useState } from 'react';

interface PendingUndo {
  id: string;
  content: string;
}

/** Own the confirmation gate between a message-footer click and undo, holding
 *  the modal open (and exposing a loading state) until the undo succeeds. */
export function useUndoConfirmation(onUndo: (id: string, content: string) => Promise<boolean>) {
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoing, setUndoing] = useState(false);

  const requestUndo = useCallback((id: string, content?: string) => {
    setPendingUndo({ id, content: content ?? '' });
  }, []);
  const closeUndoConfirm = useCallback(() => setPendingUndo(null), []);
  const confirmUndo = useCallback(async () => {
    if (!pendingUndo || undoing) return;
    setUndoing(true);
    const ok = await onUndo(pendingUndo.id, pendingUndo.content);
    // On success the timeline already reflects the rewind — close the modal.
    // On failure keep it open so the user can retry or cancel.
    if (ok) setPendingUndo(null);
    setUndoing(false);
  }, [onUndo, pendingUndo, undoing]);

  return { pendingUndo, undoing, requestUndo, closeUndoConfirm, confirmUndo };
}
