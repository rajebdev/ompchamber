/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-Sent Events client for the live agent event stream — the fallback
 * transport, kept for environments where the WebSocket upgrade is blocked
 * (HTTP-only proxies, some corporate networks).
 *
 * EventSource reconnects on transient drops by itself, so only a fatal close
 * (the server closed the stream) is reported upward.
 */

import type { AgentStreamConnection, AgentStreamHandlers, StreamConnection, StreamHandlers } from '@/shared/lib/chat/omp/transport';
import { agentEventsUrl } from '@/shared/lib/chat/omp/transport';

/** One EventSource stream: the browser owns reconnection on transient drops. */
export function connectEvents<TFrame>(url: string, handlers: StreamHandlers<TFrame>): StreamConnection {
  const source = new EventSource(url);
  let released = false;

  source.onopen = () => {
    if (released) return;
    handlers.onOpen();
  };

  source.onmessage = (event) => {
    if (released) return;
    let data: TFrame;
    try {
      data = JSON.parse(event.data) as TFrame;
    } catch {
      return;
    }
    handlers.onFrame(data);
  };

  source.onerror = () => {
    if (released) return;
    if (source.readyState === EventSource.CLOSED) handlers.onClose();
  };

  return {
    close: () => {
      released = true;
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();
    },
  };
}

/** SSE transport for a session's agent event stream. */
export function connectAgentEvents(sessionId: string, handlers: AgentStreamHandlers): AgentStreamConnection {
  return connectEvents(agentEventsUrl(sessionId), handlers);
}
