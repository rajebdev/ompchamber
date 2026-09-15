/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live agent stream wiring for the omp bridge. Owns the transport lifecycle —
 * the WebSocket socket by default, Server-Sent Events when the Chat setting
 * asks for it — and hands every decoded frame to the shared folder in
 * `@/lib/chat/omp/agent-events`, so both transports produce identical timeline
 * behavior. Kept out of useOmpAgent so that hook only owns RPC command sends +
 * agent state.
 */

import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentEvent, OmpAgentState, StreamTransport } from '@/types';
import { foldAgentEvent, type ToolResultRecord } from '@/lib/chat/omp/agent-events';
import { connectAgentSocket } from '@/lib/chat/omp/socket';
import { connectAgentEvents } from '@/lib/chat/omp/sse';
import type { AgentStreamConnection, AgentStreamHandlers } from '@/lib/chat/omp/transport';

export interface OmpStreamRefs {
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData | null>;
  interruptPendingRef: RefObject<boolean>;
}

interface UseOmpAgentStreamOptions extends OmpStreamRefs {
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
  transport: StreamTransport;
}

const CONNECTORS = {
  websocket: connectAgentSocket,
  sse: connectAgentEvents,
} as const;

export function useOmpAgentStream({
  setState,
  callbacksRef,
  toolResultsRef,
  lastToolMessageRef,
  interruptPendingRef,
  transport,
}: UseOmpAgentStreamOptions) {
  const connectionRef = useRef<AgentStreamConnection | null>(null);

  const disconnect = useCallback(() => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connection?.close();
    setState((prev) => ({ ...prev, connected: false }));
  }, [setState]);

  const connect = useCallback((sid: string) => {
    disconnect();
    const handlers: AgentStreamHandlers = {
      onOpen: () => {
        setState((prev) => ({ ...prev, connected: true }));
        callbacksRef.current?.onConnected?.();
      },
      onFrame: (data: OmpAgentEvent) => {
        foldAgentEvent(data, {
          sessionId: sid,
          setState,
          callbacksRef,
          toolResultsRef,
          lastToolMessageRef,
          interruptPendingRef,
        });
      },
      onClose: () => {
        setState((prev) => ({ ...prev, connected: false }));
      },
    };
    connectionRef.current = CONNECTORS[transport](sid, handlers);
  }, [disconnect, setState, callbacksRef, toolResultsRef, lastToolMessageRef, interruptPendingRef, transport]);

  return { connect, disconnect };
}

export type { ToolResultRecord };
