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
 * (the map the Remix server build populates) and duck-types the wrapper, so it
 * can live outside the app bundle and attach to any `http.Server` — the Vite dev
 * server (plugin in vite.config.ts) and the production entry (server/index.js)
 * share this one implementation. Commands still travel over
 * `POST /api/agent/:sessionId`; this socket is observer-only, exactly like SSE.
 */

import { WebSocketServer } from 'ws';

/** `/api/agent/<sessionId>/ws` — everything else owns its own upgrade. */
const AGENT_STREAM_PATH = /^\/api\/agent\/([^/]+)\/ws$/;

/** Coalesce `message_update` frames once this many bytes sit unsent. */
const HIGH_WATER_BYTES = 256 * 1024;

/** Longest a coalesced frame may wait before it is flushed anyway, so a burst
 *  that ends while the socket is still busy never strands the newest update. */
const FLUSH_DELAY_MS = 50;

const HEARTBEAT_MS = 30_000;

/** Marks an http server that already carries this handler (dev restarts). */
const ATTACHED = Symbol.for('ompchamber.agentStreamWebSocket');

/**
 * Live session for `sessionId`, or null when the chamber does not manage it.
 * `getRpcSession` is not importable from here (the registry lives in the app
 * bundle), but the registry itself is on globalThis for exactly this reason.
 */
function findAgentSession(sessionId) {
  const registry = globalThis.__ompSessions;
  const session = registry && typeof registry.get === 'function' ? registry.get(sessionId) : undefined;
  if (!session || typeof session.onEvent !== 'function') return null;
  if (typeof session.isAlive === 'function' && !session.isAlive()) return null;
  return session;
}

/** Refuse the upgrade with a plain HTTP response (the browser sees a failed handshake). */
function rejectUpgrade(socket, status, message) {
  const body = `${message}\n`;
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: text/plain; charset=utf-8\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n`
    + '\r\n'
    + body,
  );
  socket.destroy();
}

function pathnameOf(url) {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

/**
 * Stream one session's agent events to one client until either side goes away.
 */
function streamSession(socket, sessionId, session) {
  let closed = false;
  let unsubscribe = null;
  let heartbeat = null;
  let flushTimer = null;
  let awaitingPong = false;
  // Backpressure slot: while the client is behind, the newest `message_update`
  // is held here instead of queueing every intermediate accumulation.
  let pendingUpdate = null;

  const flushPendingUpdate = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const data = pendingUpdate;
    pendingUpdate = null;
    if (data === null) return true;
    try {
      socket.send(JSON.stringify(data));
      return true;
    } catch {
      teardown();
      return false;
    }
  };

  // A burst can end while the socket is still busy; without this the newest
  // update would wait for the next frame or the heartbeat.
  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!closed) flushPendingUpdate();
    }, FLUSH_DELAY_MS);
  };

  const send = (data) => {
    if (closed) return;
    if (data !== null && typeof data === 'object' && data.type === 'message_update' && socket.bufferedAmount > HIGH_WATER_BYTES) {
      pendingUpdate = data;
      scheduleFlush();
      return;
    }
    if (!flushPendingUpdate()) return;
    try {
      socket.send(JSON.stringify(data));
    } catch {
      teardown();
    }
  };

  function teardown() {
    if (closed) return;
    closed = true;
    pendingUpdate = null;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // Subscriber cleanup is best-effort.
      }
      unsubscribe = null;
    }
    try {
      socket.terminate();
    } catch {
      // Already gone.
    }
  }

  // Protocol-level keepalive: a client that misses a full ping cycle is gone,
  // and a live one answers without any application-level traffic.
  heartbeat = setInterval(() => {
    if (closed) return;
    if (awaitingPong) {
      teardown();
      return;
    }
    awaitingPong = true;
    if (!flushPendingUpdate()) return;
    try {
      socket.ping();
    } catch {
      teardown();
    }
  }, HEARTBEAT_MS);

  socket.on('pong', () => {
    awaitingPong = false;
  });
  socket.on('close', teardown);
  socket.on('error', teardown);
  // Observer-only: inbound frames (a stray ping reply aside) carry no meaning.
  socket.on('message', () => {});

  send({ type: 'connected', sessionId });
  if (closed) return;
  unsubscribe = session.onEvent((event) => send(event));
}

/**
 * Attach the agent event WebSocket to an http server. Idempotent per server.
 */
export function attachAgentStreamWebSocket(httpServer) {
  if (!httpServer || httpServer[ATTACHED]) return;
  httpServer[ATTACHED] = true;

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const match = AGENT_STREAM_PATH.exec(pathnameOf(request.url ?? ''));
    // Not ours: leave the socket untouched for the HMR server / other handlers.
    if (!match) return;

    const sessionId = decodeURIComponent(match[1]);
    const session = findAgentSession(sessionId);
    if (!session) {
      rejectUpgrade(socket, 409, 'Session is not managed by the chamber');
      return;
    }

    wss.handleUpgrade(request, socket, head, (client) => streamSession(client, sessionId, session));
  });

  httpServer.on('close', () => wss.close());
}
