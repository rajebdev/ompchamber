/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live connection status of the agent event stream.
 *
 * The socket lives deep inside the chat timeline while its indicator sits in
 * the top navbar — a sibling subtree — so the status travels the same way as
 * the other chamber-wide signals (`omp:session-processing`,
 * `omp:theme-changed`): a window CustomEvent. The latest value is also kept
 * here so a consumer that mounts mid-flight (layout toggle, session switch)
 * paints the current state instead of waiting for the next transition.
 */

import type { StreamTransport } from '@/types';
import { readStreamTransport } from '@/lib/chat/omp/transport';

export const AGENT_STREAM_STATUS_EVENT = 'omp:stream-status';

export interface AgentStreamStatus {
  /** Transport in force for the live stream. */
  transport: StreamTransport;
  /** Transport is attached and frames may arrive. */
  connected: boolean;
}

let latest: AgentStreamStatus = {
  transport: readStreamTransport(),
  connected: false,
};

/** Last published status — the seed for consumers mounting mid-flight. */
export function readAgentStreamStatus(): AgentStreamStatus {
  return latest;
}

/** Publish a status transition to every listener (no-op when unchanged). */
export function publishAgentStreamStatus(next: AgentStreamStatus): void {
  if (next.transport === latest.transport && next.connected === latest.connected) return;
  latest = next;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AgentStreamStatus>(AGENT_STREAM_STATUS_EVENT, { detail: next }));
}
