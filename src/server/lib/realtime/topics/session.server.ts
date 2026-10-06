/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `session:<id>` topic: one session's live state and its agent frames.
 *
 * The snapshot is `buildAgentSnapshot` — the SAME builder `GET
 * /api/agent/:sessionId` answers from, so a tab reattaching through the socket
 * and one polling the HTTP probe cannot get different answers. `attach` binds
 * the child's event fanout while anyone is watching, which is what makes the
 * topic push frames instead of every client holding a socket per session.
 *
 * A session with no live child resolves to `{running:false}` and then publishes
 * nothing — correct, because there is no run to report. The spawn path calls
 * `publishSessionState` once the child exists, which re-snapshots this topic for
 * every subscriber.
 */

import { sessionTopic } from '@/shared/lib/realtime/protocol';
import { getRealtimeHub, type TopicDescriptor } from '@/server/lib/realtime/hub.server';
import { buildAgentSnapshot } from '@/server/routes/agent/command';
import { peerOriginForSession, peerSocketUrl } from '@/server/lib/omp/rpc/peer-proxy.server';
import { getRpcSession } from '@/server/lib/omp/rpc/manager';

/**
 * Relay a session's frames from the instance that OWNS it.
 *
 * Both instances share a database and an agent dir, so the owner's stream IS
 * this session's stream; the client stays on whichever instance it opened
 * instead of being sent to another port. The owner speaks the same wire
 * protocol, so its frames become this topic's frames — and the owner's SNAPSHOT
 * is published as this topic's baseline, because the local resolver cannot
 * produce one (the child is not here).
 *
 * Reconnection is the owner's business: this bridge does not retry, because a
 * silently reconnected relay would hide the owner being gone.
 */
function attachPeerSession(sessionId: string, origin: string): () => void {
  let upstream: WebSocket;
  try {
    upstream = new WebSocket(peerSocketUrl(sessionId, origin));
  } catch {
    return () => {};
  }

  const hub = getRealtimeHub();
  upstream.onmessage = (event) => {
    if (typeof event.data !== 'string') return;
    let frame: { t?: string; payload?: unknown };
    try {
      frame = JSON.parse(event.data) as { t?: string; payload?: unknown };
    } catch {
      return;
    }
    if (frame.t === 'snapshot') hub.publishSnapshot(sessionTopic(sessionId), frame.payload);
    else if (frame.t === 'delta') hub.publish(sessionTopic(sessionId), frame.payload);
  };
  upstream.onerror = () => {};
  upstream.onclose = () => {};

  return () => {
    try {
      upstream.close();
    } catch {
      // Already gone.
    }
  };
}

export function sessionDescriptor(sessionId: string): TopicDescriptor {
  return {
    resolve: () => buildAgentSnapshot(sessionId),
    attach: () => {
      const session = getRpcSession(sessionId);
      if (session?.isAlive()) {
        return session.onEvent((event) => {
          getRealtimeHub().publish(sessionTopic(sessionId), event);
        });
      }
      // Not owned HERE: the session may be running on another instance, in which
      // case this topic relays that instance's frames. Resolved asynchronously —
      // `attach` is synchronous — so the relay's snapshot establishes the
      // baseline once it arrives.
      let detach: (() => void) | null = null;
      let cancelled = false;
      void peerOriginForSession(sessionId).then((origin) => {
        if (cancelled || !origin) return;
        detach = attachPeerSession(sessionId, origin);
      });
      return () => {
        cancelled = true;
        detach?.();
      };
    },
  };
}
