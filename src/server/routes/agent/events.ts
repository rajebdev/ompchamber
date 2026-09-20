import { getRpcSession } from '@/server/lib/omp/rpc/manager';
import { createEventCoalescer, createSseStream, type EventCoalescer } from '@/server/lib/sse';

/** Longest a coalesced `message_update` may wait before it is flushed anyway,
 *  so a burst that ends while the consumer is behind never strands the newest
 *  frame until the 30s heartbeat. Matches the WebSocket transport's policy. */
const FLUSH_DELAY_MS = 50;

// GET /api/agent/:sessionId/events — SSE stream of agent events.
// SSE is observer-only: listing or opening a saved session must not create
// another omp process for a terminal-owned session. Explicit commands use
// POST /api/agent/:sessionId, which starts the wrapper before this attaches.
export async function loader({ params, request }: { params: Record<string, string>; request: Request }) {
  const { sessionId } = params;

  const existing = getRpcSession(sessionId);
  const session = existing?.isAlive() ? existing : undefined;
  if (!session) return new Response('Session is not managed by the chamber', { status: 409 });

  // Backpressure slot: while the consumer is behind (desiredSize < 0),
  // replaceable `message_update` frames collapse to the latest one (omp sends
  // the FULL accumulated message each time, so latest-wins is safe). Control
  // frames are small and never dropped; they flush the pending update first so
  // ordering is preserved. The coalescer owns that policy; this route only
  // supplies the SSE sink and its backpressure probe.
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

      handlers.send('', { type: 'connected', sessionId });
      if (handlers.isClosed()) return;
      unsubscribe = session.onEvent((event) => coalescer?.push('', event));

      return () => {
        coalescer?.dispose();
        coalescer = null;
        if (unsubscribe) {
          try { unsubscribe(); } catch {}
          unsubscribe = null;
        }
      };
    },
  });

  return stream.response;
}
