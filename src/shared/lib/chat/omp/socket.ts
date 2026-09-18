/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket client for the live agent event stream — the default transport.
 *
 * One duplex socket per session replaces the SSE response stream: frames arrive
 * as bare JSON messages (no `data:` framing or chunk reassembly), the server
 * keeps the link warm with protocol pings instead of comment heartbeats, and a
 * dropped socket is re-dialed with capped backoff instead of relying on the
 * browser's EventSource retry loop.
 *
 * A socket that closes before it ever opened is terminal: the handshake was
 * refused (409 — the chamber does not manage the session yet), and retrying
 * would spin against a session that is not there. Same reasoning as the SSE
 * route's observer-only contract.
 */

import type { OmpAgentEvent } from '@/shared/types';
import type { AgentStreamConnection, AgentStreamHandlers } from '@/shared/lib/chat/omp/transport';
import { agentSocketUrl } from '@/shared/lib/chat/omp/transport';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
/** Consecutive re-dials that never opened before the stream is given up on. */
const MAX_FAILED_DIALS = 4;

export function connectAgentSocket(sessionId: string, handlers: AgentStreamHandlers): AgentStreamConnection {
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let established = false;
  let released = false;

  const dial = () => {
    const ws = new WebSocket(agentSocketUrl(sessionId));
    socket = ws;

    ws.onopen = () => {
      if (released) return;
      failures = 0;
      established = true;
      handlers.onOpen();
    };

    ws.onmessage = (event) => {
      if (released) return;
      let data: OmpAgentEvent;
      try {
        data = JSON.parse(String(event.data)) as OmpAgentEvent;
      } catch {
        return;
      }
      handlers.onFrame(data);
    };

    ws.onclose = () => {
      socket = null;
      if (released) return;
      handlers.onClose();
      // First dial refused, or the re-dials keep failing: stop, don't spin.
      if (!established) return;
      failures += 1;
      if (failures > MAX_FAILED_DIALS) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!released) dial();
      }, delay);
    };
  };

  dial();

  return {
    close: () => {
      released = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const ws = socket;
      socket = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    },
  };
}
