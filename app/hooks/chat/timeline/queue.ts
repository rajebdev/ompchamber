/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Follow-up + steering queue state for the chamber chat. Follow-ups queued by
 * the mock/chamber path persist to the SQLite `sessions` table (numeric ids);
 * omp sessions (string UUIDs) own their queue server-side, so their mirror is
 * client-only and removed once the agent delivers the text (message_end).
 * Kept out of useChatTimeline so that hook stays under the size ceiling.
 */

import { useCallback, useEffect, useState } from 'react';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';

export interface ChatTimelineQueueResult {
  messageQueue: QueuedMessage[];
  setMessageQueue: (updater: React.SetStateAction<QueuedMessage[]>) => void;
  steeringQueue: QueuedMessage[];
  setSteeringQueue: (updater: React.SetStateAction<QueuedMessage[]>) => void;
  /** Drop an exactly-matching text from whichever mirror queue holds it. */
  removeDeliveredFromQueue: (text: string) => void;
}

export function useChatTimelineQueue(
  sessionId: string | null,
  currentSession: { queue_list?: any } | null,
): ChatTimelineQueueResult {
  const [messageQueue, setMessageQueueLocal] = useState<QueuedMessage[]>([]);
  const [steeringQueue, setSteeringQueueLocal] = useState<QueuedMessage[]>([]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
    setMessageQueueLocal(prev => {
      const newQueue = typeof updater === 'function' ? updater(prev) : updater;
      // Queue persistence targets the SQLite `sessions` table (mock/numeric
      // sessions). omp sessions (string UUIDs) have no such row — the follow-up
      // queue is delivered to omp immediately and lives there server-side.
      if (sessionId && !Number.isNaN(Number(sessionId))) {
        fetch(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_list: newQueue })
        }).catch(console.error);
      }
      return newQueue;
    });
  }, [sessionId]);

  const setSteeringQueue = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
    setSteeringQueueLocal(prev => {
      const newQueue = typeof updater === 'function' ? updater(prev) : updater;
      return newQueue;
    });
  }, []);

  // Initialize queue from DB on mount or session change
  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
    setSteeringQueueLocal([]);
  }, [currentSession]);

  const removeDeliveredFromQueue = useCallback((text: string) => {
    const exact = (q: QueuedMessage[]) => q.some(i => i.text === text);
    setSteeringQueue(q => (exact(q) ? q.filter(i => i.text !== text) : q));
    setMessageQueue(q => (exact(q) ? q.filter(i => i.text !== text) : q));
  }, [setSteeringQueue, setMessageQueue]);

  return { messageQueue, setMessageQueue, steeringQueue, setSteeringQueue, removeDeliveredFromQueue };
}
