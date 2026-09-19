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

import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { Dispatch, RefObject, SetStateAction } from 'preact/compat';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentEvent, OmpAgentState, StreamTransport } from '@/shared/types';
import { foldAgentEvent, type ToolResultRecord } from '@/shared/lib/chat/omp/agent-events';
import { connectAgentSocket } from '@/shared/lib/chat/omp/socket';
import { connectAgentEvents } from '@/shared/lib/chat/omp/sse';
import type { AgentStreamConnection, AgentStreamHandlers } from '@/shared/lib/chat/omp/transport';
import { publishAgentStreamStatus } from '@/shared/lib/chat/omp/status';

export interface OmpStreamRefs {
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData>;
  interruptPendingRef: RefObject<boolean>;
  /** Last activity phrase published to the indicator (repeat suppression). */
  activityRef: RefObject<string>;
  /** Live thinking level (last `thinking_level_changed` frame). */
  currentThinkingLevelRef: RefObject<string | undefined>;
  /** toolCallIds of in-flight file-mutating calls (see file-mutations.ts). */
  fileMutatingCallsRef: RefObject<Set<string>>;
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
  activityRef,
  currentThinkingLevelRef,
  fileMutatingCallsRef,
  transport,
}: UseOmpAgentStreamOptions) {
  const connectionRef = useRef<AgentStreamConnection | null>(null);

  // The navbar indicator needs the transport in force even before the first
  // dial, and a transport switch invalidates any live socket — so announce it
  // on mount/change and retract on unmount.
  useEffect(() => {
    publishAgentStreamStatus({ transport, connected: false });
    return () => publishAgentStreamStatus({ transport, connected: false });
  }, [transport]);

  const disconnect = useCallback(() => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connection?.close();
    setState((prev) => ({ ...prev, connected: false }));
    publishAgentStreamStatus({ transport, connected: false });
  }, [setState, transport]);

  const connect = useCallback((sid: string) => {
    disconnect();
    const handlers: AgentStreamHandlers = {
      onOpen: () => {
        setState((prev) => ({ ...prev, connected: true }));
        publishAgentStreamStatus({ transport, connected: true });
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
          activityRef,
          currentThinkingLevelRef,
          fileMutatingCallsRef,
        });
      },
      onClose: () => {
        setState((prev) => ({ ...prev, connected: false }));
        publishAgentStreamStatus({ transport, connected: false });
      },
    };
    connectionRef.current = CONNECTORS[transport](sid, handlers);
  }, [disconnect, setState, callbacksRef, toolResultsRef, lastToolMessageRef, interruptPendingRef, activityRef, currentThinkingLevelRef, fileMutatingCallsRef, transport]);

  return { connect, disconnect };
}

export type { ToolResultRecord };
