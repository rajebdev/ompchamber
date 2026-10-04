/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Peer forwarding: when a session is owned by ANOTHER chamber instance, serve
 * the request from that instance instead of starting a second omp writer.
 *
 * ## Why forward instead of redirect
 *
 * The ownership guard (ownership.server.ts) refuses to resume a session another
 * process owns, because omp moves the second writer to a sibling file
 * (`open-elsewhere`) — the duplicate sidebar rows and split conversations this
 * whole change exists to prevent. Redirecting the tab to the owner works, but
 * it moves the user to a different port mid-conversation.
 *
 * Forwarding keeps the client on whichever instance it opened: every
 * `/api/agent/:sessionId*` request for a peer-owned session is relayed to the
 * owning instance, which runs it against the ONE omp child it already has. Both
 * instances share a database and an agent dir, so the owner is authoritative
 * and no state needs reconciling.
 *
 * ## Loop safety
 *
 * A relayed request carries {@link PEER_HOP_HEADER}. A request that already has
 * it is never forwarded again: if two instances disagree about ownership (a
 * stale record, a lease released between the two checks), the second hop
 * answers with the ownership refusal instead of bouncing the request forever.
 *
 * ## Failure
 *
 * An unreachable peer (crashed, port reused) is not an error the user should
 * see as a hang: the caller falls back to the ownership refusal, and the client
 * still has the redirect path.
 */

import { resolveSessionOwnership } from '@/server/lib/omp/session/ownership.server';

/** Marks a request already relayed once, so a peer never forwards it again. */
export const PEER_HOP_HEADER = 'x-ompchamber-peer-hop';

/** How long a relayed command may take before it is treated as unreachable. */
const PEER_TIMEOUT_MS = 120_000;

/**
 * Base URL of the instance owning `sessionId`, or null when it is free, owned
 * by this process, or owned by something the chamber cannot place (an `omp` CLI
 * run has no instance record and therefore no port to relay to).
 *
 * The record's `host` is the bind address (`0.0.0.0` for a default install),
 * which is not dialable: a peer on this machine is always reached over
 * loopback, and the port is what distinguishes instances.
 */
export async function peerOriginForSession(sessionId: string): Promise<string | null> {
  const owner = (await resolveSessionOwnership(sessionId))?.owner ?? null;
  if (!owner) return null;
  return `http://127.0.0.1:${owner.port}`;
}

/**
 * Relay a request to the owning instance and return its response unchanged.
 *
 * The method, path and body travel as-is; only the hop header is added. A
 * response is returned even when the peer answers an error — that error is the
 * owner's own answer and is more truthful than anything this instance could
 * invent.
 *
 * `parsedBody` is supplied when the caller has ALREADY consumed the request
 * body (the command route parses it before deciding to relay). Reading the body
 * twice is impossible, so the parsed value is re-serialized rather than cloned
 * up front — the common path never pays for a clone it does not use.
 */
export async function forwardToPeer(
  request: Request,
  origin: string,
  parsedBody?: unknown,
): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  headers.set(PEER_HOP_HEADER, '1');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let payload: BodyInit | undefined;
  if (hasBody) {
    if (parsedBody !== undefined) {
      headers.set('content-type', 'application/json');
      payload = JSON.stringify(parsedBody);
    } else {
      payload = await request.arrayBuffer();
    }
  }
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `The instance running this session is not reachable (${reason}).`, code: 'peer_unreachable' },
      { status: 502 },
    );
  }
}

/** True when this request was already relayed once and must not hop again. */
export function isPeerRelayed(request: Request): boolean {
  return request.headers.get(PEER_HOP_HEADER) === '1';
}

/**
 * WebSocket URL on the owning instance for a session's agent stream, or null
 * when there is nothing to relay to.
 */
export function peerSocketUrl(sessionId: string, origin: string): string {
  const base = origin.replace(/^http/, 'ws');
  return `${base}/api/agent/${encodeURIComponent(sessionId)}/ws`;
}
