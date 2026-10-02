/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live connection status of the agent event stream.
 *
 * The socket lives deep inside the chat timeline while its indicator sits in
 * the top navbar — a sibling subtree — so the status travels the same way as
 * the other chamber-wide signals (`omp:theme-changed` and the shared
 * session-status store): a window CustomEvent. The latest value is also kept
 * here so a consumer that mounts mid-flight (layout toggle, session switch)
 * paints the current state instead of waiting for the next transition.
 */

import type { StreamTransport } from '@/shared/types';
import { readStreamTransport } from '@/shared/lib/chat/omp/transport';

export const AGENT_STREAM_STATUS_EVENT = 'omp:stream-status';

export interface AgentStreamStatus {
  /** Transport in force for the live stream. */
  transport: StreamTransport;
  /** Transport is attached and frames may arrive. */
  connected: boolean;
}

/**
 * The last published status, resolved on the FIRST read rather than at import.
 *
 * The seed is the configured transport, which is read from the chamber settings
 * snapshot — module state that a sibling suite in the same `bun test` process
 * can prime before this module is ever imported. Resolving lazily keeps the
 * documented behaviour ("a consumer that mounts mid-flight paints the current
 * state") without letting an unrelated file's fixture decide the default.
 */
let latest: AgentStreamStatus | null = null;

/** Last published status — the seed for consumers mounting mid-flight. */
export function readAgentStreamStatus(): AgentStreamStatus {
  latest ??= { transport: readStreamTransport(), connected: false };
  return latest;
}

/** Publish a status transition to every listener (no-op when unchanged). */
export function publishAgentStreamStatus(next: AgentStreamStatus): void {
  if (latest && next.transport === latest.transport && next.connected === latest.connected) return;
  latest = next;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AgentStreamStatus>(AGENT_STREAM_STATUS_EVENT, { detail: next }));
}

/**
 * Forget the published status, so the next read seeds from the transport again.
 *
 * Paired with `publishAgentStreamStatus`, and what keeps "the seed is the
 * configured transport, disconnected" observable: the store is module state
 * that outlives a whole `bun test` process, so a suite that published a
 * transition must be able to unpublish.
 */
export function resetAgentStreamStatus(): void {
  latest = null;
}
