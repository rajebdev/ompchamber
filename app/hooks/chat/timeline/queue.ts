/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Follow-up + steering queue state for the chamber chat, backed by the SQLite
 * `queued_messages` table via /api/sessions/:id/queue (one row per item with a
 * model snapshot, so auto-delivery replays the settings the item was queued
 * with).
 *
 * The client panel stays the source of truth while the session is open: every
 * mutation updates React state first, then PUTs the full remaining list to the
 * route (replace-on-write keeps ids stable for reorder/edit/delete). The queue
 * hydrates from the table on mount — a page reload mid-stream restores it.
 * Steering mirrors live in the session-state blob under a separate key.
 *
 * Kept out of useChatTimeline so that hook stays under the size ceiling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueuedMessage } from '@/types';
import { useSessionState } from '@/hooks/workspace/session-state';

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
  const [messageQueue, setMessageQueueState] = useState<QueuedMessage[]>([]);
  const [steeringQueue, setSteeringQueue] = useSessionState<QueuedMessage[]>(STEERING_STATE_KEY, []);

  // Hydrate from the table once per session. A generation-safe ref skips the
  // stale-response race when the user switches sessions quickly.
  const hydrateEpochRef = useRef(0);
  useEffect(() => {
    if (!sessionId) {
      setMessageQueueState([]);
      return;
    }
    const epoch = ++hydrateEpochRef.current;
    let cancelled = false;
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/queue`)
      .then(res => (res.ok ? res.json() : { queue: [] }))
      .then((data: { queue?: QueuedMessage[] }) => {
        if (cancelled || hydrateEpochRef.current !== epoch) return;
        setMessageQueueState(Array.isArray(data.queue) ? data.queue : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  // Replace-on-write mirror: every client mutation PUTs the full list so the
  // table always matches the panel (order, edits, deletions included).
  const mirrorQueue = useCallback((next: QueuedMessage[]) => {
    if (!sessionId) return;
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/queue`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue: next }),
    }).catch(console.error);
  }, [sessionId]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
    setMessageQueueState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      mirrorQueue(next);
      return next;
    });
  }, [mirrorQueue]);

  const removeDeliveredFromQueue = useCallback((text: string) => {
    const exact = (q: QueuedMessage[]) => q.some(i => i.text === text);
    setSteeringQueue(q => (exact(q) ? q.filter(i => i.text !== text) : q));
    setMessageQueue(q => (exact(q) ? q.filter(i => i.text !== text) : q));
  }, [setSteeringQueue, setMessageQueue]);

  return { messageQueue, setMessageQueue, steeringQueue, setSteeringQueue, removeDeliveredFromQueue };
}
