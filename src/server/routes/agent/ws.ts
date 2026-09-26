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
 * latest one while the client is behind) — the policy itself lives in
 * `createEventCoalescer`, shared with the SSE route — but carried by one duplex
 * socket: no per-event HTTP framing, no browser reconnect storm, and
 * protocol-level ping/pong keepalive instead of a comment frame every 30s.
 *
 * Transport-only by design. It reads the live session registry off `globalThis`
 * (the map the server build populates) and duck-types the wrapper, so the
 * registry contract survives any HTTP framework owning the port.
 *
 * **Per-connection state lives on `ws.data`, not in a `WeakMap` keyed by the
 * `ws` object.** Elysia's Bun adapter builds a fresh wrapper per callback and
 * hands `pong` the raw socket, so a WeakMap lookup always missed: the pong
 * never cleared `awaitingPong` and the second heartbeat closed a healthy
 * socket at 60s, while `close` leaked the interval and the session
 * subscription. `attachObserverStream` owns the lifecycle; see
 * `@/server/lib/observer-ws` for the measurements.
 */

import { Elysia, t } from 'elysia';
import { attachObserverStream, createObserverState, type ObserverConnectionState } from '@/server/lib/observer-ws';

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

/** Elysia's ws context, narrowed to the per-connection store this route adds. */
type AgentWsData = { params: { sessionId: string }; observer?: ObserverConnectionState };

export const agentWsRoutes = new Elysia({ prefix: '/api/agent' }).ws('/:sessionId/ws', {
  params: t.Object({ sessionId: t.String() }),

  beforeHandle({ params, status }) {
    if (!findAgentSession(params.sessionId)) {
      return status(409, 'Session is not managed by the chamber');
    }
  },

  open(ws) {
    const data = ws.data as unknown as AgentWsData;
    const sessionId = data.params.sessionId;
    const session = findAgentSession(sessionId);
    if (!session) {
      ws.close();
      return;
    }

    const state = createObserverState();
    data.observer = state;
    const { push } = attachObserverStream(state, ws);

    state.unsubscribe = session.onEvent((event) => push('', event));
    push('', { type: 'connected', sessionId });
  },

  pong(ws) {
    const state = (ws.data as unknown as AgentWsData).observer;
    if (state) state.awaitingPong = false;
  },

  message() {
    // Observer-only: inbound frames carry no meaning.
  },

  close(ws) {
    const state = (ws.data as unknown as AgentWsData).observer;
    if (state) state.teardown();
  },
});
