/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket transport for the live omp agent event stream — the lighter
 * sibling of `GET /api/agent/:sessionId/events` (SSE).
 *
 * Same frame vocabulary (JSON objects with a `type`, first frame `connected`),
 * same backpressure policy (replaceable `message_update` frames collapse to the
 * latest one while the client is behind), but carried by one duplex socket:
 * no per-event HTTP framing, no browser reconnect storm, and protocol-level
 * ping/pong keepalive instead of a comment frame every 30s.
 *
 * Transport-only by design. It reads the live session registry off `globalThis`
 * (the map the server build populates) and duck-types the wrapper, so the
 * registry contract survives any HTTP framework owning the port.
 */

import { Elysia, t } from 'elysia';

/** Coalesce `message_update` frames once this many bytes sit unsent. */
const HIGH_WATER_BYTES = 256 * 1024;

/** Longest a coalesced frame may wait before it is flushed anyway, so a burst
 *  that ends while the socket is still busy never strands the newest update. */
const FLUSH_DELAY_MS = 50;

const HEARTBEAT_MS = 30_000;

interface AgentEventSession {
  isAlive?: () => boolean;
  onEvent: (listener: (event: unknown) => void) => () => void;
}

interface Registry {
  get: (sessionId: string) => AgentEventSession | undefined;
}

/** Live session for `sessionId`, or null when the chamber does not manage it. */
function findAgentSession(sessionId: string): AgentEventSession | null {
  const registry = (globalThis as { __ompSessions?: Registry }).__ompSessions;
  const session = registry && typeof registry.get === 'function' ? registry.get(sessionId) : undefined;
  if (!session || typeof session.onEvent !== 'function') return null;
  if (typeof session.isAlive === 'function' && !session.isAlive()) return null;
  return session;
}

interface ConnectionState {
  closed: boolean;
  unsubscribe: (() => void) | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  awaitingPong: boolean;
  pendingUpdate: unknown;
}

const connections = new WeakMap<object, ConnectionState>();

export const agentWsRoutes = new Elysia({ prefix: '/api/agent' }).ws('/:sessionId/ws', {
  params: t.Object({ sessionId: t.String() }),

  beforeHandle({ params, status }) {
    if (!findAgentSession(params.sessionId)) {
      return status(409, 'Session is not managed by the chamber');
    }
  },

  open(ws) {
    const sessionId = ws.data.params.sessionId;
    const session = findAgentSession(sessionId);
    if (!session) {
      ws.close();
      return;
    }

    const state: ConnectionState = {
      closed: false,
      unsubscribe: null,
      heartbeat: null,
      flushTimer: null,
      awaitingPong: false,
      pendingUpdate: null,
    };
    connections.set(ws, state);

    const flushPendingUpdate = (): boolean => {
      if (state.flushTimer !== null) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
      const data = state.pendingUpdate;
      state.pendingUpdate = null;
      if (data === null) return true;
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch {
        teardown();
        return false;
      }
    };

    // A burst can end while the socket is still busy; without this the newest
    // update would wait for the next frame or the heartbeat.
    const scheduleFlush = () => {
      if (state.flushTimer !== null) return;
      state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        if (!state.closed) flushPendingUpdate();
      }, FLUSH_DELAY_MS);
    };

    const send = (data: unknown) => {
      if (state.closed) return;
      const type = (data as { type?: string } | null)?.type;
      const buffered = (ws.raw as { bufferedAmount?: number }).bufferedAmount ?? 0;
      if (type === 'message_update' && buffered > HIGH_WATER_BYTES) {
        state.pendingUpdate = data;
        scheduleFlush();
        return;
      }
      if (!flushPendingUpdate()) return;
      try {
        ws.send(JSON.stringify(data));
      } catch {
        teardown();
      }
    };

    function teardown() {
      if (state.closed) return;
      state.closed = true;
      state.pendingUpdate = null;
      if (state.flushTimer !== null) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
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
    }

    // Protocol-level keepalive: a client that misses a full ping cycle is gone,
    // and a live one answers without any application-level traffic.
    state.heartbeat = setInterval(() => {
      if (state.closed) return;
      if (state.awaitingPong) {
        teardown();
        return;
      }
      state.awaitingPong = true;
      if (!flushPendingUpdate()) return;
      try {
        (ws.raw as { ping?: () => void }).ping?.();
      } catch {
        teardown();
      }
    }, HEARTBEAT_MS);

    state.unsubscribe = session.onEvent((event) => send(event));
    send({ type: 'connected', sessionId });
  },

  pong(ws) {
    const state = connections.get(ws);
    if (state) state.awaitingPong = false;
  },

  message() {
    // Observer-only: inbound frames carry no meaning.
  },

  close(ws) {
    const state = connections.get(ws);
    if (!state || state.closed) return;
    state.closed = true;
    state.pendingUpdate = null;
    if (state.flushTimer !== null) clearTimeout(state.flushTimer);
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
