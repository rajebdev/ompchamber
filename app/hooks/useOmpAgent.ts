import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageData } from '@/types';

/**
 * Live omp agent bridge for the chamber chat (real mode, MOCK=false).
 *
 * Mirrors the omp-web useAgentSession streaming surface, scoped to what the
 * chamber timeline needs: send a prompt over the RPC bridge
 * (POST /api/agent/:sessionId), then consume agent events over SSE
 * (GET /api/agent/:sessionId/events) and fold them into ChatMessageData.
 *
 * The omp event stream carries full accumulated messages (message_update),
 * so the client keeps a single "current assistant message" that is replaced
 * on every update and finalized on message_end / agent_end.
 */

export interface OmpAgentEvent {
  type: string;
  [key: string]: unknown;
}

export interface OmpAgentCallbacks {
  onAgentStart?: () => void;
  onMessageUpdate?: (msg: ChatMessageData) => void;
  onMessageEnd?: (msg: ChatMessageData) => void;
  onAgentEnd?: (info: { errorMessage?: string; message?: string }) => void;
  onPromptError?: (errorMessage: string) => void;
  onNotice?: (level: string, message: string) => void;
  onConnected?: () => void;
}

interface OmpAgentState {
  isGenerating: boolean;
  connected: boolean;
  error: string | null;
}

/** Convert an omp AgentMessage (content blocks) into the chamber ChatMessageData shape. */
function toChatMessage(raw: Record<string, unknown>): ChatMessageData {
  const content = raw.content;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((block) => {
        if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
          return (block as { text?: unknown }).text ?? '';
        }
        return '';
      })
      .join('');
  }
  const id = typeof raw.id === 'string' ? raw.id : `msg-${Date.now()}-ai`;
  const role = raw.role === 'user' ? 'user' : 'ai';
  const timestamp = typeof raw.timestamp === 'number' ? new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined;
  return {
    id,
    role,
    date: timestamp ? `Today, ${timestamp}` : undefined,
    timestamp,
    content: text,
    thinking: raw.thinking as ChatMessageData['thinking'],
    toolCalls: raw.toolCalls as ChatMessageData['toolCalls'],
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    error: raw.error as ChatMessageData['error'],
  };
}

export function useOmpAgent(sessionId: string | null, callbacks: OmpAgentCallbacks) {
  const [state, setState] = useState<OmpAgentState>({ isGenerating: false, connected: false, error: null });
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const disconnect = useCallback(() => {
    const es = eventSourceRef.current;
    eventSourceRef.current = null;
    if (es) {
      es.onopen = null;
      es.onmessage = null;
      es.onerror = null;
      es.close();
    }
    setState((prev) => ({ ...prev, connected: false }));
  }, []);

  const connect = useCallback((sid: string) => {
    disconnect();
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;
    es.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
      callbacksRef.current.onConnected?.();
    };
    es.onmessage = (e) => {
      let data: OmpAgentEvent;
      try {
        data = JSON.parse(e.data) as OmpAgentEvent;
      } catch {
        return;
      }
      switch (data.type) {
        case 'agent_start':
          setState((prev) => ({ ...prev, isGenerating: true, error: null }));
          callbacksRef.current.onAgentStart?.();
          break;
        case 'message_start':
        case 'message_update': {
          const msg = data.message as Record<string, unknown> | undefined;
          if (msg && msg.role !== 'user') {
            callbacksRef.current.onMessageUpdate?.(toChatMessage(msg));
          }
          break;
        }
        case 'message_end': {
          const completed = data.message as Record<string, unknown> | undefined;
          if (completed && completed.role !== 'user') {
            callbacksRef.current.onMessageEnd?.(toChatMessage(completed));
          }
          break;
        }
        case 'agent_end': {
          setState((prev) => ({ ...prev, isGenerating: false }));
          callbacksRef.current.onAgentEnd?.({
            errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
            message: typeof data.message === 'string' ? data.message : undefined,
          });
          break;
        }
        case 'prompt_error': {
          setState((prev) => ({ ...prev, isGenerating: false, error: typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed' }));
          callbacksRef.current.onPromptError?.(typeof data.errorMessage === 'string' ? data.errorMessage : 'Prompt failed');
          break;
        }
        case 'notice': {
          callbacksRef.current.onNotice?.(
            typeof data.level === 'string' ? data.level : 'info',
            typeof data.message === 'string' ? data.message : '',
          );
          break;
        }
        case 'thinking_level_changed':
        case 'model_changed':
        case 'config_update':
        case 'available_commands_update':
        case 'connected':
          break;
        default:
          break;
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; only surface a hard failure when the
      // stream never opened (the route 409s for unmanaged sessions).
      if (es.readyState === EventSource.CLOSED) {
        setState((prev) => ({ ...prev, connected: false }));
      }
    };
  }, [disconnect]);

  useEffect(() => {
    if (!sessionId) return;
    // Do NOT auto-connect here: the SSE route 409s until the session's omp
    // process is spawned (POST /api/agent/:id), and an EventSource to a 409
    // loops network errors in the console. connect() is called lazily by
    // sendPrompt after the spawn succeeds.
    return () => disconnect();
  }, [sessionId, disconnect]);

  /** Send a prompt to the omp session via the RPC bridge. */
  const sendPrompt = useCallback(async (message: string, images?: { data: string; mimeType: string }[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return false;
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      // Mirror omp-web handleSend: warm the session process up with get_state
      // (spawns it on first use), then attach the SSE stream before sending
      // the prompt so no agent events are missed.
      const warmup = await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'get_state' }),
      });
      if (warmup.ok) connect(sid);

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
        return false;
      }
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }, [connect]);

  /** Abort the running agent turn. */
  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await fetch(`/api/agent/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'abort' }),
      });
    } catch {
      // Abort is best-effort; the SSE stream will surface the terminal state.
    }
    setState((prev) => ({ ...prev, isGenerating: false }));
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

  return { ...state, sendPrompt, abort, setModel, setThinkingLevel, disconnect };
}
