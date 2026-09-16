/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FIFO queue of pending omp ask/approval dialogs.
 *
 * omp runs a turn's tool calls concurrently, and every gated call emits its OWN
 * `extension_ui_request` and then blocks until that exact id is answered: two
 * `bash` calls in one turn under `always-ask` produce two `select` frames in the
 * same second. A single dialog slot kept only the last request, so each earlier
 * tool call stayed blocked on an approval nobody could answer and the turn never
 * reached `agent_end` — the run looked hung until Stop.
 *
 * Requests surface one at a time in arrival order; answering the head advances
 * the queue. Extracted from useChatTimeline to stay under the size ceiling.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ExtensionUiDialogRequest } from '@/types/omp/agent';

export interface ExtensionDialogQueue {
  /** Head of the queue — the single dialog to render. */
  dialog: ExtensionUiDialogRequest | null;
  enqueue: (request: ExtensionUiDialogRequest) => void;
  /** Advance past the head once its response has been sent. */
  dismiss: () => void;
  /** Drop a request omp withdrew (`method: 'cancel'`) without an answer. */
  withdraw: (targetId: string) => void;
}

export function useExtensionDialogQueue(sessionId: string | null): ExtensionDialogQueue {
  const [queue, setQueue] = useState<ExtensionUiDialogRequest[]>([]);

  // A pending request belongs to the session whose omp process raised it, and
  // the frame is never re-delivered: carrying it into another session would
  // answer the wrong process.
  useEffect(() => {
    setQueue([]);
  }, [sessionId]);

  const enqueue = useCallback((request: ExtensionUiDialogRequest) => {
    // Replay-on-reattach can race the live stream for the same request; one
    // entry per omp id keeps the queue answerable exactly once.
    setQueue((current) => (current.some((pending) => pending.id === request.id) ? current : [...current, request]));
  }, []);
  const dismiss = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);
  const withdraw = useCallback((targetId: string) => {
    setQueue((current) => current.filter((pending) => pending.id !== targetId));
  }, []);

  return { dialog: queue[0] ?? null, enqueue, dismiss, withdraw };
}
