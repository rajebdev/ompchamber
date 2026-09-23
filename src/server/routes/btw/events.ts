/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `GET /api/btw/:sessionId/events` — SSE stream of a session's BTW frames.
 *
 * Unlike the agent stream this one is not observer-only: a side question's
 * history must be readable for a session whose omp child is not running (that
 * is the normal state of a session opened from the sidebar), so the route
 * subscribes to the registry and never spawns anything.
 */

import { createEventCoalescer, createSseStream, type EventCoalescer } from '@/server/lib/sse';
import { btwStateFor, subscribeBtw } from '@/server/lib/btw/registry.server';
import type { BtwFrame } from '@/shared/types';

/** Longest a coalesced frame may wait before it is flushed anyway. */
const FLUSH_DELAY_MS = 50;

export async function loader({ params, request }: { params: Record<string, string>; request: Request }) {
  const { sessionId } = params;
  if (!sessionId) return new Response('session id is required', { status: 400 });

  let coalescer: EventCoalescer | null = null;

  const stream = createSseStream({
    heartbeatMs: 30_000,
    signal: request.signal,
    beforeHeartbeat: () => coalescer?.flush() ?? true,
    onStart(handlers) {
      let unsubscribe: (() => void) | null = null;
      coalescer = createEventCoalescer({
        send: (event, data) => handlers.send(event, data),
        isBackpressured: handlers.isBackpressured,
        flushDelayMs: FLUSH_DELAY_MS,
      });
      const push = (frame: BtwFrame) => coalescer?.push('', frame);

      handlers.send('', { type: 'connected', sessionId });
      if (handlers.isClosed()) return;
      unsubscribe = subscribeBtw(sessionId, push);
      void btwStateFor(sessionId)
        .then((state) => push({ type: 'btw_state', state }))
        .catch((error: unknown) => {
          push({
            type: 'btw_error',
            topicId: null,
            message: error instanceof Error ? error.message : String(error),
          });
        });

      return () => {
        coalescer?.dispose();
        coalescer = null;
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch {
            // Subscriber cleanup is best-effort.
          }
          unsubscribe = null;
        }
      };
    },
  });

  return stream.response;
}
