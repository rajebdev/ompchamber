/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client view of the follow-up queue (SQLite `queued_messages`, owned by the
 * server). The panel is a VIEW: mutations go through the per-item endpoints
 * (`POST/PATCH/DELETE /api/sessions/:id/queue[/:itemId]`) and every response
 * carries the canonical queue, which replaces local state wholesale. The old
 * client-side replace-on-write mirror is gone — it was what let a reload
 * hydrating over an empty state wipe the table, and a session switch PUT one
 * session's list into another's rows.
 *
 * Steering still mirrors into the per-session session-state blob (client-only
 * by design: an interrupt-and-reply is only meaningful while a client watches
 * the run).
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { QueuedMessage } from '@/shared/types';
import { useSessionState } from '@/client/hooks/workspace/session-state';

const STEERING_STATE_KEY = 'chat.steeringQueue';

function queueUrl(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/queue`;
}

async function readQueueResponse(res: Response): Promise<QueuedMessage[] | null> {
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { queue?: unknown } | null;
  return Array.isArray(data?.queue) ? (data.queue as QueuedMessage[]) : null;
}

export interface ChatTimelineQueueResult {
  messageQueue: QueuedMessage[];
  /** Append one item; local state updates optimistically, then reconciles
   *  from the canonical response. No-op without a session. */
  enqueueMessage: (item: Omit<QueuedMessage, 'id'>) => void;
  /** Edit one item's text (PATCH). */
  editMessageText: (id: string, text: string) => void;
  /** Remove one item by id (DELETE). */
  removeMessage: (id: string) => void;
  /** Reorder the queue to these ids (PUT, drag-and-drop). */
  reorderMessages: (orderedIds: string[]) => void;
  /** Replace the local list from a fetch (mount hydration, manual refresh). */
  refresh: () => void;
  /** Client-only steering mirror (session-state blob). */
  steeringQueue: QueuedMessage[];
  setSteeringQueue: (value: QueuedMessage[] | ((prev: QueuedMessage[]) => QueuedMessage[])) => void;
}

export function useChatTimelineQueue(sessionId: string | null): ChatTimelineQueueResult {
  const [messageQueue, setMessageQueueState] = useState<QueuedMessage[]>([]);
  const [steeringQueue, setSteeringQueue] = useSessionState<QueuedMessage[]>(STEERING_STATE_KEY, []);

  // Hydrate from the table once per session, and re-read when the tab
  // regains focus (a second tab may have claimed/delivered the head). A
  // generation-safe ref skips the stale-response race on quick switches.
  const hydrateEpochRef = useRef(0);
  const cancelledRef = useRef(false);
  const refresh = useCallback(() => {
    if (!sessionId) {
      setMessageQueueState([]);
      return;
    }
    const epoch = ++hydrateEpochRef.current;
    fetch(queueUrl(sessionId))
      .then((res) => readQueueResponse(res))
      .then((queue) => {
        if (cancelledRef.current || hydrateEpochRef.current !== epoch) return;
        setMessageQueueState(queue ?? []);
      })
      .catch(() => {});
  }, [sessionId]);
  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  // Mounted session with queued items: offer the server a delivery slot. The
  // server-side claim makes this harmless when a run is active or another tab
  // already took the head — this used to be the client auto-delivery effect,
  // which fired into whatever session was open at the time.
  useEffect(() => {
    if (!sessionId || messageQueue.length === 0) return;
    fetch(`${queueUrl(sessionId)}/deliver`, { method: 'POST' }).catch(() => {});
  }, [sessionId, messageQueue.length > 0]);

  const enqueueMessage = useCallback((item: Omit<QueuedMessage, 'id'>) => {
    if (!sessionId) return;
    const optimistic: QueuedMessage = { ...item, id: `queue-${Date.now()}` };
    setMessageQueueState((prev) => [...prev, optimistic]);
    fetch(queueUrl(sessionId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
      .then((res) => readQueueResponse(res))
      .then((queue) => { if (queue) setMessageQueueState(queue); })
      .catch(() => {});
  }, [sessionId]);

  const editMessageText = useCallback((id: string, text: string) => {
    if (!sessionId) return;
    fetch(`${queueUrl(sessionId)}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((res) => readQueueResponse(res))
      .then((queue) => { if (queue) setMessageQueueState(queue); })
      .catch(() => {});
  }, [sessionId]);

  const removeMessage = useCallback((id: string) => {
    if (!sessionId) return;
    // Optimistic removal, reconciled only on failure (404 = already claimed —
    // the item is gone either way).
    setMessageQueueState((prev) => prev.filter((i) => i.id !== id));
    fetch(`${queueUrl(sessionId)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then((res) => readQueueResponse(res))
      .then((queue) => { if (queue) setMessageQueueState(queue); })
      .catch(() => {});
  }, [sessionId]);

  const reorderMessages = useCallback((orderedIds: string[]) => {
    if (!sessionId) return;
    setMessageQueueState((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      return orderedIds.map((id) => byId.get(id)).filter((i): i is QueuedMessage => Boolean(i));
    });
    fetch(queueUrl(sessionId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })
      .then((res) => readQueueResponse(res))
      .then((queue) => { if (queue) setMessageQueueState(queue); })
      .catch(() => {});
  }, [sessionId]);

  return { messageQueue, enqueueMessage, editMessageText, removeMessage, reorderMessages, refresh, steeringQueue, setSteeringQueue };
}
