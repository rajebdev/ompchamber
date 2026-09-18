/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subscribe to the live agent-stream status for UI that lives outside the chat
 * subtree — the top navbar's transport indicator. Published by
 * `useOmpAgentStream`, which owns the socket lifecycle.
 */

import { useEffect, useState } from 'preact/hooks';
import { AGENT_STREAM_STATUS_EVENT, readAgentStreamStatus, type AgentStreamStatus } from '@/shared/lib/chat/omp/status';

export function useAgentStreamStatus(): AgentStreamStatus {
  const [status, setStatus] = useState<AgentStreamStatus>(readAgentStreamStatus);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<AgentStreamStatus>).detail;
      if (!detail) return;
      setStatus({ transport: detail.transport, connected: detail.connected });
    };
    window.addEventListener(AGENT_STREAM_STATUS_EVENT, onStatus);
    // Re-sync in case a transition landed between render and subscribe.
    setStatus(readAgentStreamStatus());
    return () => window.removeEventListener(AGENT_STREAM_STATUS_EVENT, onStatus);
  }, []);

  return status;
}
