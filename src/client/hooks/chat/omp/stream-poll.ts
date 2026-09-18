/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sidebar poll in the shape of the context panel's `usePanelRefresh`: one
 * stable interval for the hook's lifetime; each tick checks the LIVE stream
 * status through a ref and revalidates only when some session is mid-stream.
 *
 * This is the belt to the `omp:session-updated` suspenders: it closes the
 * case where a background session finishes while the user sits on another
 * one (no event dispatch fires on this client). The status snapshot flows
 * through the loader, so the tick only ever observes the latest revalidated
 * state — a stale snapshot can never keep the timer armed.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { SessionStreamStatus } from '@/client/hooks/chat/omp/session-statuses';

/** Poll cadence while any session is streaming (ms). */
const STREAM_POLL_MS = 5000;

export function useStreamPoll(
  sessionStatus: Record<string, SessionStreamStatus>,
  revalidate: () => void,
): void {
  const hasStreamingRef = useRef(Object.values(sessionStatus).includes('stream'));
  hasStreamingRef.current = Object.values(sessionStatus).includes('stream');
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;

  useEffect(() => {
    const id = setInterval(() => {
      if (hasStreamingRef.current) revalidateRef.current();
    }, STREAM_POLL_MS);
    return () => clearInterval(id);
  }, []);
}
