/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subscribe a component to one realtime topic.
 *
 * The reader every data-backed panel shares: the server pushes when a topic
 * changes, so a panel renders what it is handed instead of asking on a timer.
 *
 * Two rules carried over from the polling hooks it replaced, because they were
 * right:
 *
 *   - **`enabled: false` subscribes to nothing.** A hidden panel — or one whose
 *     session is not selected — must not keep a subscription alive, or the
 *     server would produce snapshots nobody renders.
 *   - **A topic switch drops the old value first.** The panel's topic encodes
 *     the session it describes, so rendering the previous session's data under
 *     the new title is the failure this prevents.
 *
 * `stale` is surfaced rather than hidden: it means the socket is down or a
 * sequence gap was seen, and a panel should say so instead of showing a value
 * of unknown age as if it were current.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { realtimeClient, type RealtimeStatus } from '@/shared/lib/realtime/client';

export interface RealtimeTopicState<T> {
  data: T | null;
  /** No value has arrived yet for this topic. */
  isLoading: boolean;
  /** The value on hand is not known to be current. */
  stale: boolean;
  status: RealtimeStatus;
  /** Ask the server for a fresh snapshot (a panel's own Refresh). */
  refresh: () => void;
}

export function useRealtimeTopic<T>(
  topic: string | null,
  options: { enabled?: boolean } = {},
): RealtimeTopicState<T> {
  const { enabled = true } = options;
  const active = enabled && topic !== null;

  const [data, setData] = useState<T | null>(() => (topic ? realtimeClient.read<T>(topic) : null));
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState<RealtimeStatus>(realtimeClient.status);
  // The topic a render belongs to, so a late notification for the previous one
  // cannot repaint the panel that has moved on.
  const topicRef = useRef(topic);
  topicRef.current = topic;

  useEffect(() => {
    // A new topic is a new question: drop the previous answer before the
    // snapshot lands, or the old session's data renders under the new title.
    if (!active || topic === null) {
      setData(null);
      setStale(false);
      return;
    }
    setData(realtimeClient.read<T>(topic));
    setStale(realtimeClient.isStale(topic));

    const listener = () => {
      const current = topicRef.current;
      if (current === null) return;
      setData(realtimeClient.read<T>(current));
      setStale(realtimeClient.isStale(current));
    };
    const unsubscribe = realtimeClient.subscribe(topic, listener);
    return () => {
      unsubscribe();
    };
  }, [topic, active]);

  useEffect(() => realtimeClient.onStatus(() => setStatus(realtimeClient.status())), []);

  const refresh = useCallback(() => {
    if (topic !== null) realtimeClient.refresh(topic);
  }, [topic]);

  return { data, isLoading: data === null, stale, status, refresh };
}
