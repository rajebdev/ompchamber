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

import type { OmpAgentEvent } from '@/shared/types';
import type { AgentStreamConnection, AgentStreamHandlers } from '@/shared/lib/chat/omp/transport';
import { agentEventsUrl } from '@/shared/lib/chat/omp/transport';

export function connectAgentEvents(sessionId: string, handlers: AgentStreamHandlers): AgentStreamConnection {
  const source = new EventSource(agentEventsUrl(sessionId));
  let released = false;

  source.onopen = () => {
    if (released) return;
    handlers.onOpen();
  };

  source.onmessage = (event) => {
    if (released) return;
    let data: OmpAgentEvent;
    try {
      data = JSON.parse(event.data) as OmpAgentEvent;
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
