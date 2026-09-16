/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Follow-up + steering queue state for the chamber chat. Both mirrors persist
 * to the per-session `session_ui_state` blob so a page reload mid-stream
 * restores them:
 *
 *  - Mock/numeric sessions additionally mirror into the SQLite `sessions`
 *    `queue_list` column (the sidebar loader reads it from there).
 *  - omp sessions (string UUIDs) have no such row — their queue lives in the
 *    session-state blob only, restored on mount.
 *
 * Steering mirrors live in the same blob under a separate key. Delivered
 * texts are removed once the agent picks them up (message_end).
 * Kept out of useChatTimeline so that hook stays under the size ceiling.
 */

import { useCallback } from 'react';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import { useSessionState } from '@/hooks/workspace/session-state';

const QUEUE_STATE_KEY = 'chat.messageQueue';
const STEERING_STATE_KEY = 'chat.steeringQueue';

export interface ChatTimelineQueueResult {
  messageQueue: QueuedMessage[];
  setMessageQueue: (updater: React.SetStateAction<QueuedMessage[]>) => void;
  steeringQueue: QueuedMessage[];
  setSteeringQueue: (updater: React.SetStateAction<QueuedMessage[]>) => void;
  /** Drop an exactly-matching text from whichever mirror queue holds it. */
  removeDeliveredFromQueue: (text: string) => void;
}

export function useChatTimelineQueue(sessionId: string | null): ChatTimelineQueueResult {
  const [messageQueue, setMessageQueue] = useSessionState<QueuedMessage[]>(QUEUE_STATE_KEY, []);
  const [steeringQueue, setSteeringQueue] = useSessionState<QueuedMessage[]>(STEERING_STATE_KEY, []);

  const setQueueWithMirror = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
    setMessageQueue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Keep the legacy SQLite mirror for mock/numeric sessions (the sidebar
      // loader reads `sessions.queue_list`); omp UUIDs have no row — skip.
      if (sessionId && !Number.isNaN(Number(sessionId))) {
        fetch(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_list: next })
        }).catch(console.error);
      }
      return next;
    });
  }, [setMessageQueue, sessionId]);

  const removeDeliveredFromQueue = useCallback((text: string) => {
    const exact = (q: QueuedMessage[]) => q.some(i => i.text === text);
    setSteeringQueue(q => (exact(q) ? q.filter(i => i.text !== text) : q));
    setQueueWithMirror(q => (exact(q) ? q.filter(i => i.text !== text) : q));
  }, [setSteeringQueue, setQueueWithMirror]);

  return { messageQueue, setMessageQueue: setQueueWithMirror, steeringQueue, setSteeringQueue, removeDeliveredFromQueue };
}
