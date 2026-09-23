/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket transport for a session's BTW frame stream — the default sibling
 * of `GET /api/btw/:sessionId/events`, mirroring the agent stream's protocol:
 * one duplex socket per session, bare JSON frames, `connected` first, a
 * protocol-level ping/pong keepalive, and the same latest-wins coalescer.
 *
 * A client that attaches replays nothing: the socket's first `btw_state` is
 * the session's current history, so a reload lands on the same panel a live
 * stream would have produced.
 */

import { Elysia, t } from 'elysia';
import { createEventCoalescer, type EventCoalescer } from '@/server/lib/sse';
import { STREAM_HEARTBEAT_MS } from '@/shared/lib/workspace/refresh-cadence';
import { btwStateFor, subscribeBtw } from '@/server/lib/btw/registry.server';
import type { BtwFrame } from '@/shared/types';

/** Coalesce frames once this many bytes sit unsent. */
const HIGH_WATER_BYTES = 256 * 1024;

/** Longest a coalesced frame may wait before it is flushed anyway. */
const FLUSH_DELAY_MS = 50;

interface ConnectionState {
  closed: boolean;
  unsubscribe: (() => void) | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  awaitingPong: boolean;
  coalescer: EventCoalescer | null;
}

const connections = new WeakMap<object, ConnectionState>();

export const btwWsRoutes = new Elysia({ prefix: '/api/btw' }).ws('/:sessionId/ws', {
  params: t.Object({ sessionId: t.String() }),

  open(ws) {
    const sessionId = ws.data.params.sessionId;
    const state: ConnectionState = { closed: false, unsubscribe: null, heartbeat: null, awaitingPong: false, coalescer: null };
    connections.set(ws, state);
    // Unchecked: Elysia exposes the server socket untyped. Both members are
    // optional, so an absent one degrades (no byte count / no keepalive)
    // instead of failing.
    const raw = ws.raw as { bufferedAmount?: number; ping?: () => void };

    const teardown = () => {
      if (state.closed) return;
      state.closed = true;
      state.coalescer?.dispose();
      state.coalescer = null;
      if (state.heartbeat !== null) {
        clearInterval(state.heartbeat);
        state.heartbeat = null;
      }
      if (state.unsubscribe) {
        try {
          state.unsubscribe();
        } catch {
          // Subscriber cleanup is best-effort.
        }
        state.unsubscribe = null;
      }
      try {
        ws.close();
      } catch {
        // Already gone.
      }
    };

    state.coalescer = createEventCoalescer({
      send: (_event, data) => {
        try {
          ws.send(JSON.stringify(data));
        } catch {
          teardown();
        }
      },
      isBackpressured: () => (raw.bufferedAmount ?? 0) > HIGH_WATER_BYTES,
      flushDelayMs: FLUSH_DELAY_MS,
    });

    state.heartbeat = setInterval(() => {
      if (state.closed) return;
      if (state.awaitingPong) {
        teardown();
        return;
      }
      state.awaitingPong = true;
      if (!state.coalescer?.flush()) return;
      try {
        raw.ping?.();
      } catch {
        teardown();
      }
    }, STREAM_HEARTBEAT_MS);

    const push = (frame: BtwFrame) => state.coalescer?.push('', frame);
    state.unsubscribe = subscribeBtw(sessionId, push);
    push({ type: 'connected', sessionId });
    void btwStateFor(sessionId)
      .then((snapshot) => push({ type: 'btw_state', state: snapshot }))
      .catch((error: unknown) => {
        push({ type: 'btw_error', topicId: null, message: error instanceof Error ? error.message : String(error) });
      });
  },

  pong(ws) {
    const state = connections.get(ws);
    if (state) state.awaitingPong = false;
  },

  message() {
    // Observer-only: commands go through POST /api/btw/:sessionId.
  },

  close(ws) {
    const state = connections.get(ws);
    if (!state || state.closed) return;
    state.closed = true;
    state.coalescer?.dispose();
    state.coalescer = null;
    if (state.heartbeat !== null) clearInterval(state.heartbeat);
    if (state.unsubscribe) {
      try {
        state.unsubscribe();
      } catch {
        // Subscriber cleanup is best-effort.
      }
    }
  },
});
