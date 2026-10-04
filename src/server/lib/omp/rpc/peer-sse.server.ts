/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-Sent Events bridge to the instance that owns a session.
 *
 * The SSE counterpart of `peer-ws.server.ts`, and it exists for the same
 * reason: a client on instance B opening `/api/agent/:id/events` for a
 * peer-owned session must see the owner's frames, not a 409. Both instances
 * share a database and an agent dir, so the owner's stream IS this session's
 * stream.
 *
 * The upstream response body is piped through unchanged — the client already
 * speaks this protocol, and re-encoding frames here would only add a second
 * place for the wire format to drift. Only the upstream's status is inspected:
 * a refused upgrade (409, owner gone) becomes this instance's own 409 rather
 * than an empty 200 that would leave the client waiting for frames forever.
 */

import { PEER_HOP_HEADER } from '@/server/lib/omp/rpc/peer-proxy.server';

/** Longest the upstream may take to answer its headers before giving up. */
const UPSTREAM_HEADER_TIMEOUT_MS = 30_000;

export async function bridgePeerEvents(request: Request, sessionId: string, origin: string): Promise<Response> {
  const target = new URL(`/api/agent/${encodeURIComponent(sessionId)}/events`, origin);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        [PEER_HOP_HEADER]: '1',
      },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_HEADER_TIMEOUT_MS)]),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Response(`The instance running this session is not reachable (${reason}).`, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body ?? 'Session is not managed by the chamber', { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
