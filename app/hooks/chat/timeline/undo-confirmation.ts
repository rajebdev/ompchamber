import { useCallback, useState } from 'react';

interface PendingUndo {
  id: string;
  content: string;
}

/** Own the confirmation gate between a message-footer click and undo. */
export function useUndoConfirmation(onUndo: (id: string, content: string) => void) {
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  const requestUndo = useCallback((id: string, content?: string) => {
    setPendingUndo({ id, content: content ?? '' });
  }, []);
  const closeUndoConfirm = useCallback(() => setPendingUndo(null), []);
  const confirmUndo = useCallback(() => {
    if (!pendingUndo) return;
    onUndo(pendingUndo.id, pendingUndo.content);
    setPendingUndo(null);
  }, [onUndo, pendingUndo]);

  return { pendingUndo, requestUndo, closeUndoConfirm, confirmUndo };
}
