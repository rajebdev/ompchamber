/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Transport contract for the live agent event stream, shared by the WebSocket
 * socket (default) and the Server-Sent Events fallback. Both dial
 * `/api/agent/:sessionId/*`, emit the same JSON frames, and differ only in how
 * the bytes travel — so `useOmpAgentStream` picks one and folds frames
 * identically.
 */

import type { OmpAgentEvent, StreamTransport } from '@/shared/types';
import { readChamberSetting } from '@/shared/lib/settings/client';

export interface AgentStreamHandlers {
  /** Transport is attached; frames may arrive. */
  onOpen: () => void;
  /** One decoded event frame. */
  onFrame: (data: OmpAgentEvent) => void;
  /** Transport is gone for good (no further frames without a re-dial). */
  onClose: () => void;
}

export interface AgentStreamConnection {
  /** Permanently release the transport; no callbacks fire afterwards. */
  close: () => void;
}

export const DEFAULT_STREAM_TRANSPORT: StreamTransport = 'websocket';

/** WebSocket endpoint for a session's agent event stream. */
export function agentSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/agent/${encodeURIComponent(sessionId)}/ws`;
}

/** SSE endpoint for a session's agent event stream. */
export function agentEventsUrl(sessionId: string): string {
  return `/api/agent/${encodeURIComponent(sessionId)}/events`;
}

/**
 * Resolve the configured stream transport from the chamber settings snapshot.
 */
export function readStreamTransport(appSettings?: Record<string, any>): StreamTransport {
  const configured = readChamberSetting<unknown>('streamTransport', appSettings);
  return configured === 'sse' || configured === 'websocket' ? configured : DEFAULT_STREAM_TRANSPORT;
}
