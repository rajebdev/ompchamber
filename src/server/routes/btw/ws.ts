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
 *
 * **Per-connection state lives on `ws.data`, not in a `WeakMap` keyed by the
 * `ws` object** — Elysia's Bun adapter hands `pong` the raw socket and a fresh
 * wrapper to every other callback, so a WeakMap lookup always missed and the
 * second heartbeat closed a healthy socket. See `@/server/lib/observer-ws`.
 */

import { Elysia, t } from 'elysia';
import { attachObserverStream, createObserverState, type ObserverConnectionState } from '@/server/lib/observer-ws';
import { btwStateFor, subscribeBtw } from '@/server/lib/btw/registry.server';
import type { BtwFrame } from '@/shared/types';

/** Elysia's ws context, narrowed to the per-connection store this route adds. */
type BtwWsData = { params: { sessionId: string }; observer?: ObserverConnectionState };

export const btwWsRoutes = new Elysia({ prefix: '/api/btw' }).ws('/:sessionId/ws', {
  params: t.Object({ sessionId: t.String() }),

  open(ws) {
    const data = ws.data as unknown as BtwWsData;
    const sessionId = data.params.sessionId;
    const state = createObserverState();
    data.observer = state;
    const { push } = attachObserverStream(state, ws);

    const send = (frame: BtwFrame) => push('', frame);
    state.unsubscribe = subscribeBtw(sessionId, send);
    send({ type: 'connected', sessionId });
    void btwStateFor(sessionId)
      .then((snapshot) => send({ type: 'btw_state', state: snapshot }))
      .catch((error: unknown) => {
        send({ type: 'btw_error', topicId: null, message: error instanceof Error ? error.message : String(error) });
      });
  },

  pong(ws) {
    const state = (ws.data as unknown as BtwWsData).observer;
    if (state) state.awaitingPong = false;
  },

  message() {
    // Observer-only: commands go through POST /api/btw/:sessionId.
  },

  close(ws) {
    const state = (ws.data as unknown as BtwWsData).observer;
    if (state) state.teardown();
  },
});
