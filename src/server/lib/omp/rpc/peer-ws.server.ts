/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket bridge to the instance that owns a session.
 *
 * A client on instance B opening `/api/agent/:id/ws` for a peer-owned session
 * gets this instance's socket, backed by an upstream WebSocket to the owner.
 * Frames flow owner → client unchanged, so the client's fold cannot tell the
 * two apart, and the single omp child stays where it is.
 *
 * The connection reuses `attachObserverStream` for the client-facing half — the
 * coalescer, the keepalive and the idempotent teardown are exactly the same
 * policy a locally-owned session gets. The upstream socket is hung on the
 * state's `unsubscribe` slot, so teardown (from any path: client close, a send
 * failure, the heartbeat) closes it too and no bridge leaks.
 *
 * A dropped upstream does not retry here: the client's own reconnect logic
 * re-dials, and a bridge that silently reconnected would hide the owner being
 * gone.
 */

import { attachObserverStream, type ObserverConnectionState, type ObserverSocket } from '@/server/lib/observer-ws';

/** Open the upstream socket and pipe it into the client connection. */
export function attachPeerStream(state: ObserverConnectionState, ws: ObserverSocket, upstreamUrl: string): void {
  const { push } = attachObserverStream(state, ws);

  let upstream: WebSocket;
  try {
    upstream = new WebSocket(upstreamUrl);
  } catch (error) {
    push('', { type: 'error', error: `Could not reach the instance running this session (${String(error)}).` });
    state.teardown();
    return;
  }

  // Installed BEFORE the handlers: if the client disconnects while the upstream
  // is still connecting, teardown has already run with `unsubscribe` set, and
  // the socket is closed rather than left to open against nobody.
  state.unsubscribe = () => {
    try {
      upstream.close();
    } catch {
      // Already gone.
    }
  };

  upstream.onmessage = (event) => {
    if (state.closed) return;
    try {
      push('', typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
    } catch {
      // A non-JSON frame from a peer is not worth tearing the stream down for.
    }
  };
  upstream.onclose = () => {
    if (!state.closed) state.teardown();
  };
  upstream.onerror = () => {
    if (!state.closed) state.teardown();
  };
}
