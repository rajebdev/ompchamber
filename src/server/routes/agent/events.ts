import { getRpcSession } from '@/server/lib/omp/rpc/manager';

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

  const encoder = new TextEncoder();
  let streamCleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let cleaned = false;
      let unsubscribe: (() => void) | null = null;
      // Backpressure slot: while the consumer is behind (desiredSize < 0),
      // replaceable `message_update` frames collapse to the latest one (omp
      // sends the FULL accumulated message each time, so latest-wins is safe).
      // Control/terminal frames are small and never dropped; they flush the
      // pending update first so ordering is preserved.
      let pendingUpdate: unknown | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (cleaned) return;
        closed = true;
        cleaned = true;
        pendingUpdate = null;
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (unsubscribe) {
          try { unsubscribe(); } catch {}
          unsubscribe = null;
        }
        request.signal?.removeEventListener('abort', cleanup);
        try {
          controller.close();
        } catch {
          // controller already closed
        }
      };
      streamCleanup = cleanup;

      const flushPendingUpdate = (): boolean => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        const data = pendingUpdate;
        pendingUpdate = null;
        if (data === null) return true;
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      // A burst can end while the consumer is still behind; without this the
      // newest update would wait for the next frame or the heartbeat.
      const scheduleFlush = () => {
        if (flushTimer !== null) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          if (!closed) flushPendingUpdate();
        }, FLUSH_DELAY_MS);
      };

      const encode = (data: unknown) => {
        if (closed) return;
        const type = (data as { type?: string } | null)?.type;
        // Coalesce while backpressured; never buffer unboundedly.
        if (type === 'message_update' && controller.desiredSize !== null && controller.desiredSize < 0) {
          pendingUpdate = data;
          scheduleFlush();
          return;
        }
        if (!flushPendingUpdate()) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Heartbeat every 30s to prevent server/proxy timeout.
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        if (!flushPendingUpdate()) return;
        try {
          controller.enqueue(encoder.encode(':\n\n'));
        } catch {
          cleanup();
        }
      }, 30_000);

      // Detect client disconnect via abort signal.
      request.signal?.addEventListener('abort', cleanup);
      if (request.signal?.aborted) {
        cleanup();
        return;
      }

      encode({ type: 'connected', sessionId });
      if (closed) return;
      unsubscribe = session.onEvent((event) => encode(event));
    },
    cancel() {
      streamCleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
