import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AgentImage, ChatMessageData, OmpAgentCallbacks, OmpAgentHandle, OmpAgentState, StreamTransport } from '@/shared/types';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';
import { type ToolResultRecord, useOmpAgentStream } from '@/client/hooks/chat/omp/stream';
import { useOmpPromptSender } from '@/client/hooks/chat/omp/prompt-send';
import { stopAgentSession } from '@/shared/lib/chat/omp/abort';

/**
 * Live omp agent bridge for the chamber chat (real mode, MOCK=false). Mirrors
 * the omp-web useAgentSession streaming surface: send a prompt over the RPC
 * bridge (POST /api/agent/:sessionId), consume agent events over the configured
 * transport, and fold them into ChatMessageData — one "current assistant
 * message" replaced per message_update, finalized on message_end / agent_end.
 */

export type { ExtensionUiDialogMethod, ExtensionUiDialogRequest, IncomingExtensionUiRequest } from '@/shared/types/omp/agent';
export type { OmpAgentCallbacks, OmpAgentEvent, OmpAgentState } from '@/shared/types/omp/agent';

export function useOmpAgent(sessionId: string | null, callbacks: OmpAgentCallbacks, transport: StreamTransport): OmpAgentHandle {
  const [state, setState] = useState<OmpAgentState>({ isGenerating: false, connected: false, error: null });
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Tool results arrive as separate events (tool_execution_end) or as
  // toolResult messages AFTER the assistant message with the toolCall block.
  // Accumulate them here and merge into the matching tool call on message_end.
  const toolResultsRef = useRef<Map<string, ToolResultRecord>>(new Map());
  // Last assistant message that carried tool calls, so tool_execution_end
  // events arriving after message_end can re-emit it with the result paired.
  const lastToolMessageRef = useRef<ChatMessageData | null>(null);
  const interruptPendingRef = useRef(false);
  // Last phrase handed to the indicator; the fold compares against it so
  // per-token frames cannot spam state updates with the same string.
  const activityRef = useRef('');
  const currentThinkingLevelRef = useRef<string | undefined>(undefined); // live thinking level (last `thinking_level_changed`)
  // toolCallIds of in-flight file-mutating tool calls; cleared per run in the
  // fold so a completed edit/write/bash signals the right panels once.
  const fileMutatingCallsRef = useRef<Set<string>>(new Set());

  const { connect, disconnect } = useOmpAgentStream({
    setState,
    callbacksRef,
    toolResultsRef,
    lastToolMessageRef,
    interruptPendingRef,
    activityRef,
    currentThinkingLevelRef,
    fileMutatingCallsRef,
    transport,
  });

  useEffect(() => {
    if (!sessionId) return;
    // Session changed (or first mount): drop the previous session's tool
    // results. On first mount the refs are already empty, so this cannot disturb
    // a resumed session's reattach below.
    toolResultsRef.current.clear();
    fileMutatingCallsRef.current.clear();
    lastToolMessageRef.current = null;
    activityRef.current = '';
    // Do NOT auto-connect here: the stream endpoint refuses (409) until the
    // session's omp process is spawned (POST /api/agent/:id), and a client
    // dialing a refused endpoint loops network errors in the console.
    // connect() is called lazily by sendPrompt after the spawn succeeds.
    let cancelled = false;
    // Reload/remount recovery: the omp process keeps running server-side
    // after a page refresh, so a mid-run session must reattach its event
    // stream or the in-flight response appears frozen. Probe get_state; when the
    // wrapper reports streaming/prompt-running, reconnect and let the caller
    // resume the generating UI.
    fetch(`/api/agent/${encodeURIComponent(sessionId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: {
        running?: boolean;
        /** Set when the server answered from local flags, not a get_state RPC. */
        busy?: boolean;
        state?: { isStreaming?: boolean; isPromptRunning?: boolean };
        pendingUiRequests?: ExtensionUiDialogRequest[];
      } | null) => {
        if (cancelled || !data?.running) return;
        const probe = data.state;
        if (data.busy || probe?.isStreaming || probe?.isPromptRunning) {
          connect(sessionId);
          callbacksRef.current.onResumeStream?.();
        }
        // An ask/approval dialog raised before the reload is still blocking the
        // agent, and omp never re-sends the frame: replay what the server
        // remembered so the modal reappears instead of the run hanging.
        for (const request of data.pendingUiRequests ?? []) {
          callbacksRef.current.onExtensionUiRequest?.(request);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [sessionId, disconnect, connect]);

  // Prompt delivery (warm-up + stream attach + the dispatch-time sidebar
  // signal) lives in its own module so this hook stays under the size ceiling.
  const { sendPrompt, sendNewPrompt } = useOmpPromptSender({ sessionIdRef, connect, setState });

  /** Abort the running agent turn. */
  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    // A user stop supersedes an in-flight interrupt-and-reply: clearing the
    // guard lets the aborted turn's agent_end reach onAgentEnd (no stuck spinner).
    interruptPendingRef.current = false;
    // Self-escalating: a child that does not stop within the helper's grace
    // period is reset instead, so a wedged session cannot hang the button.
    await stopAgentSession(sid);
    setState((prev) => ({ ...prev, isGenerating: false }));
  }, []);

  /** Interrupt the running agent and immediately start the message as a fresh
   *  prompt (abort_and_prompt). Keeps the run alive until the new agent_start
   *  arrives via the interruptPending guard. */
  const sendInterruptAndReply = useCallback(async (
    message: string,
    images?: AgentImage[],
  ): Promise<boolean> => {
    const sid = sessionIdRef.current;
    if (!sid) return false;
    interruptPendingRef.current = true;
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'abort_and_prompt',
          message,
          ...(images?.length ? { images } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || body.error) {
        interruptPendingRef.current = false;
        setState((prev) => ({ ...prev, isGenerating: false, error: body.error ?? `HTTP ${res.status}` }));
        return false;
      }
      return true;
    } catch (e) {
      interruptPendingRef.current = false;
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }, []);

  /** Enqueue a follow-up message the agent processes after the current turn. */
  const sendFollowUp = useCallback(async (
    message: string,
    images?: AgentImage[],
  ): Promise<boolean> => {
    const sid = sessionIdRef.current;
    if (!sid) return false;
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'follow_up',
          message,
          ...(images?.length ? { images } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || body.error) {
        setState((prev) => ({ ...prev, error: body.error ?? `HTTP ${res.status}` }));
        return false;
      }
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }, []);

  /** Set the model for the live session (set_model RPC). */
  const setModel = useCallback(async (provider: string, modelId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_model', provider, modelId }),
      });
    } catch {
      // Model change is best-effort; the next get_state reconciles.
    }
  }, []);

  /** Set the thinking level for the live session (set_thinking_level RPC). */
  const setThinkingLevel = useCallback(async (level: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_thinking_level', level }),
      });
    } catch {
      // Best-effort; "auto" leaves omp's current setting untouched.
    }
  }, []);

  /** Jawab dialog ask/approval (extension_ui_response) — melepas blocking tool call. */
  const respondToExtensionUi = useCallback(async (
    request: ExtensionUiDialogRequest,
    response: { value: string } | { confirmed: boolean } | { cancelled: true },
  ): Promise<void> => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'extension_ui_response', id: request.id, ...response }),
      });
    } catch {
      // Best-effort; omp surfaces the failure on its side.
    }
  }, []);

  return {
    ...state,
    sendPrompt,
    sendNewPrompt,
    sendInterruptAndReply,
    sendFollowUp,
    abort,
    setModel,
    setThinkingLevel,
    respondToExtensionUi,
    disconnect,
  };
}
