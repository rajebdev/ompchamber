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
import { peerOriginForSession, peerSocketUrl } from '@/server/lib/omp/rpc/peer-proxy.server';
import { attachPeerStream } from '@/server/lib/omp/rpc/peer-ws.server';

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
type AgentWsData = {
  params: { sessionId: string };
  observer?: ObserverConnectionState;
  /** Set when this session is owned by another instance; the socket bridges. */
  peerOrigin?: string;
};

export const agentWsRoutes = new Elysia({ prefix: '/api/agent' }).ws('/:sessionId/ws', {
  params: t.Object({ sessionId: t.String() }),

  async beforeHandle({ params, status }) {
    if (findAgentSession(params.sessionId)) return;
    // Not managed HERE: the session may be running on another instance. That is
    // not a refusal — the socket bridges to the owner so the client stays on
    // whichever instance it opened. Only a session no instance owns is refused.
    if (await peerOriginForSession(params.sessionId)) return;
    return status(409, 'Session is not managed by the chamber');
  },

  open(ws) {
    const data = ws.data as unknown as AgentWsData;
    const sessionId = data.params.sessionId;
    const session = findAgentSession(sessionId);

    const state = createObserverState();
    data.observer = state;

    if (session) {
      const { push } = attachObserverStream(state, ws);
      state.unsubscribe = session.onEvent((event) => push('', event));
      push('', { type: 'connected', sessionId });
      return;
    }

    // Re-resolve rather than trust `beforeHandle`: ownership can move between
    // the upgrade check and this callback, and a stale origin would bridge to
    // an instance that no longer holds the session.
    void peerOriginForSession(sessionId).then((origin) => {
      if (state.closed) return;
      if (!origin) {
        state.teardown();
        return;
      }
      data.peerOrigin = origin;
      attachPeerStream(state, ws, peerSocketUrl(sessionId, origin));
    });
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
