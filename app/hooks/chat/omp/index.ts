import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentHandle, OmpAgentState, StreamTransport } from '@/types';
import type { ExtensionUiDialogRequest } from '@/types/omp/agent';
import type { ApprovalMode } from '@/lib/omp/config/access-mode';
import { useOmpAgentStream, type ToolResultRecord } from '@/hooks/chat/omp/stream';

/**
 * Live omp agent bridge for the chamber chat (real mode, MOCK=false).
 *
 * Mirrors the omp-web useAgentSession streaming surface, scoped to what the
 * chamber timeline needs: send a prompt over the RPC bridge
 * (POST /api/agent/:sessionId), then consume agent events over the configured
 * transport (WebSocket by default, SSE on request) from
 * `/api/agent/:sessionId/*` and fold them into ChatMessageData.
 *
 * The omp event stream carries full accumulated messages (message_update),
 * so the client keeps a single "current assistant message" that is replaced
 * on every update and finalized on message_end / agent_end.
 */

export type { ExtensionUiDialogMethod, ExtensionUiDialogRequest, IncomingExtensionUiRequest } from '@/types/omp/agent';
export type { OmpAgentCallbacks, OmpAgentEvent, OmpAgentState } from '@/types/omp/agent';

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

  const { connect, disconnect } = useOmpAgentStream({
    setState,
    callbacksRef,
    toolResultsRef,
    lastToolMessageRef,
    interruptPendingRef,
    transport,
  });

  useEffect(() => {
    if (!sessionId) return;
    // Session changed (or first mount): drop the previous session's tool
    // results. On first mount the refs are already empty, so this cannot disturb
    // a resumed session's reattach below.
    toolResultsRef.current.clear();
    lastToolMessageRef.current = null;
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
        state?: { isStreaming?: boolean; isPromptRunning?: boolean };
        pendingUiRequests?: ExtensionUiDialogRequest[];
      } | null) => {
        if (cancelled || !data?.running) return;
        const probe = data.state;
        if (probe && (probe.isStreaming || probe.isPromptRunning)) {
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

  /** Send a prompt to the omp session via the RPC bridge. */
  const sendPrompt = useCallback(async (
    message: string,
    images?: { data: string; mimeType: string }[],
    options?: { accessMode?: ApprovalMode },
  ) => {
    const sid = sessionIdRef.current;
    if (!sid) return false;
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      // Mirror omp-web handleSend: warm the session process up with get_state
      // (spawns it on first use), then attach the event stream before sending
      // the prompt so no agent events are missed.
      const warmup = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The mode rides the warmup too: this is the request that lazily spawns
        // an idle session, and omp only accepts --approval-mode at spawn time.
        body: JSON.stringify({
          type: 'get_state',
          ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
        }),
      });
      if (warmup.ok) connect(sid);

      const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prompt',
          message,
          ...(images?.length ? { images } : {}),
          ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || body.error) {
        setState((prev) => ({ ...prev, isGenerating: false, error: body.error ?? `HTTP ${res.status}` }));
        return false;
      }
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }, [connect]);

  /** Spawn a brand-new omp session and send the first prompt: ensure_session
   *  first (returns omp's real session id), attach the event stream, then send
   *  the prompt through the existing session route so no agent events are
   *  missed. Model/thinking picks ride the ensure_session body so omp applies
   *  them BEFORE the first prompt (and their JSONL change entries are written
   *  up front, not after the run starts). Returns the new session id on
   *  success, or null on failure — the caller adopts the id as the active
   *  session. */
  const sendNewPrompt = useCallback(async (
    message: string,
    cwd: string,
    images?: { data: string; mimeType: string }[],
    composerOptions?: { model?: { provider: string; modelId: string } | null; thinkingLevel?: string | null; accessMode?: ApprovalMode },
  ): Promise<{ sessionId: string; model: { provider: string; modelId: string } | null } | null> => {
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      const created = await fetch('/api/agent/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ensure_session',
          cwd,
          ...(composerOptions?.model ? composerOptions.model : {}),
          ...(composerOptions?.thinkingLevel ? { thinkingLevel: composerOptions.thinkingLevel } : {}),
          ...(composerOptions?.accessMode ? { accessMode: composerOptions.accessMode } : {}),
        }),
      });
      const createdBody = (await created.json().catch(() => ({}))) as {
        success?: boolean;
        sessionId?: string;
        model?: { provider: string; modelId: string } | null;
        error?: string;
      };
      if (!created.ok || !createdBody.sessionId) {
        setState((prev) => ({ ...prev, isGenerating: false, error: createdBody.error ?? `HTTP ${created.status}` }));
        return null;
      }
      const sid = createdBody.sessionId;
      connect(sid);
      const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prompt',
          message,
          ...(images?.length ? { images } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || body.error) {
        setState((prev) => ({ ...prev, isGenerating: false, error: body.error ?? `HTTP ${res.status}` }));
        return null;
      }
      return { sessionId: sid, model: createdBody.model ?? null };
    } catch (e) {
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return null;
    }
  }, [connect]);

  /** Abort the running agent turn. */
  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    // A user stop supersedes an in-flight interrupt-and-reply: clearing the
    // guard lets the aborted turn's agent_end reach onAgentEnd (no stuck spinner).
    interruptPendingRef.current = false;
    try {
      await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'abort' }),
      });
    } catch {
      // Abort is best-effort; the event stream surfaces the terminal state.
    }
    setState((prev) => ({ ...prev, isGenerating: false }));
  }, []);

  /** Interrupt the running agent and immediately start the message as a fresh
   *  prompt (abort_and_prompt). Keeps the run alive until the new agent_start
   *  arrives via the interruptPending guard. */
  const sendInterruptAndReply = useCallback(async (
    message: string,
    images?: { data: string; mimeType: string }[],
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
    images?: { data: string; mimeType: string }[],
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
