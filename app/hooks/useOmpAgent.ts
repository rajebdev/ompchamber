import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageData, ToolCallData } from '@/types';

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
}

/** Tool events carry result/partialResult as a string or as an omp content
 *  block ({content:[{type:'text',text}]}) — normalize both to plain text. */
function toolResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const content = (value as { content?: unknown }).content;
    return extractTextFromContent(content);
  }
  return '';
}

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

/** Frame `extension_ui_request` dari omp (ask dialog, approval, OAuth). */
export type ExtensionUiDialogMethod = 'select' | 'confirm' | 'input' | 'editor';

export interface ExtensionUiDialogRequest {
  type: 'extension_ui_request';
  id: string;
  method: ExtensionUiDialogMethod;
  title: string;
  options?: string[];
  optionDetails?: { description?: string }[];
  message?: string;
  placeholder?: string;
  prefill?: string;
  timeout?: number;
}

export type IncomingExtensionUiRequest =
  | ExtensionUiDialogRequest
  | { type: 'extension_ui_request'; id: string; method: 'cancel'; targetId: string }
  | { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error' }
  | { type: 'extension_ui_request'; id: string; method: 'open_url'; url: string; launchUrl?: string; instructions?: string };

export interface OmpAgentCallbacks {
  onAgentStart?: () => void;
  onMessageUpdate?: (msg: ChatMessageData) => void;
  onMessageEnd?: (msg: ChatMessageData) => void;
  onAgentEnd?: (info: { errorMessage?: string; message?: string }) => void;
  onPromptError?: (errorMessage: string) => void;
  onNotice?: (level: string, message: string) => void;
  onConnected?: () => void;
  /** Mount-time probe found the session mid-run → the stream was reattached
   *  and the UI should resume its generating state. */
  onResumeStream?: () => void;
  /** Ask/approval dialog diminta omp — blocking sampai di-respond. */
  onExtensionUiRequest?: (request: IncomingExtensionUiRequest) => void;
}

interface OmpAgentState {
  isGenerating: boolean;
  connected: boolean;
  error: string | null;
}

/** Convert an omp AgentMessage (content blocks) into the chamber ChatMessageData shape.
 *  Custom-role frames (ultrathink-notice, xdev-mount-notice, ...) become a
 *  `notice` row — omp marks them display:false, so they render as an alert,
 *  never as assistant content. */
function toChatMessage(raw: Record<string, unknown>, streaming = true): ChatMessageData | null {
  if (raw.role === 'custom') {
    const content = raw.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? (b as { text?: unknown }).text ?? '' : ''))
            .join('')
        : '';
    const notice = text.replace(/<\/?system-notice[^>]*>/g, '').trim();
    if (!notice) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : `notice-${Date.now()}`,
      role: 'ai',
      content: '',
      notice,
    };
  }
    const content = raw.content;
    let text = '';
    let thinking: ChatMessageData['thinking'];
    let toolCalls: ChatMessageData['toolCalls'];
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      const blocks: (ToolCallData & { _toolCallId?: string })[] = [];
      const thoughtParts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as { type?: unknown; text?: unknown; thinking?: unknown; toolCallId?: unknown; toolName?: unknown; name?: unknown; id?: unknown; input?: unknown; arguments?: unknown; duration?: unknown; durationMs?: unknown; isError?: unknown; details?: unknown };
        if (b.type === 'text' && typeof b.text === 'string') {
          text += b.text;
        } else if (b.type === 'thinking') {
          if (typeof b.thinking === 'string') thoughtParts.push(b.thinking);
          else if (typeof b.text === 'string') thoughtParts.push(b.text);
        } else if (b.type === 'toolCall') {
          const tcId = typeof b.toolCallId === 'string' ? b.toolCallId : (typeof b.id === 'string' ? b.id : `tc-${Date.now()}`);
          const toolName = typeof b.toolName === 'string' ? b.toolName : (typeof b.name === 'string' ? b.name : 'Tool');
          const rawInput = (b.input ?? b.arguments) as Record<string, unknown> | undefined;
          const command =
            rawInput && typeof rawInput.command === 'string'
              ? rawInput.command
              : rawInput && typeof rawInput.cmd === 'string'
                ? rawInput.cmd
                : rawInput && typeof rawInput.CommandLine === 'string'
                  ? rawInput.CommandLine
                  : '';
          const target =
            rawInput && typeof rawInput.path === 'string'
              ? rawInput.path
              : rawInput && typeof rawInput.TargetFile === 'string'
                ? rawInput.TargetFile
                : rawInput && typeof rawInput.targetFile === 'string'
                  ? rawInput.targetFile
                  : rawInput && typeof rawInput.file === 'string'
                    ? rawInput.file
                    : '';
          blocks.push({
            id: tcId,
            type: toolName as ToolCallData['type'],
            title: command || target ? `${toolName} — ${command || target}` : toolName,
            name: toolName,
            intent: rawInput && typeof rawInput.i === 'string' ? rawInput.i : undefined,
            target,
            command,
            input: rawInput,
            status: streaming ? 'running' : 'success',
          });
        } else if (b.type === 'toolResult') {
          const targetId = typeof b.toolCallId === 'string' ? b.toolCallId : undefined;
          const resultText = typeof b.text === 'string' ? b.text : '';
          const found = blocks.find(tc => tc._toolCallId === targetId) ?? blocks[blocks.length - 1];
          if (found) {
            found.output = resultText;
            found.status = 'success';
            if (typeof b.duration === 'string') found.duration = b.duration;
            if (typeof b.durationMs === 'number') found.durationMs = b.durationMs;
            if (b.isError === true) {
              found.isError = true;
              found.status = 'error';
            }
            if (b.details && typeof b.details === 'object') {
              found.details = b.details as Record<string, any>;
              if ((b.details as Record<string, unknown>).__synthetic === true) {
                found.synthetic = true;
                found.status = 'skipped';
              }
            }
          }
        }
      }
      blocks.forEach((tc) => { delete tc._toolCallId; });
      if (thoughtParts.length) thinking = { thought: thoughtParts.join('\n'), isGenerating: streaming };
      if (blocks.length) toolCalls = blocks;
    }
  const id = typeof raw.id === 'string' ? raw.id : `msg-${raw.timestamp ?? Date.now()}-ai`;
  const role = raw.role === 'user' ? 'user' : 'ai';
  const timestamp = typeof raw.timestamp === 'number' ? new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined;
  return {
    id,
    role,
    date: timestamp ? `Today, ${timestamp}` : undefined,
    timestamp,
    content: text,
    thinking: thinking ?? (raw.thinking as ChatMessageData['thinking']),
    toolCalls: toolCalls ?? (raw.toolCalls as ChatMessageData['toolCalls']),
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
  // Tool results arrive as separate events (tool_execution_end) or as
  // toolResult messages AFTER the assistant message with the toolCall block.
  // Accumulate them here and merge into the matching tool call on message_end.
  const toolResultsRef = useRef<Map<string, { output: string; isError?: boolean; details?: Record<string, any> }>>(new Map());
  // Last assistant message that carried tool calls, so tool_execution_end
  // events arriving after message_end can re-emit it with the result paired.
  const lastToolMessageRef = useRef<ChatMessageData | null>(null);

  const pairToolOutputs = (msg: ChatMessageData): ChatMessageData => {
    if (!msg.toolCalls?.length) return msg;
    const toolCalls = msg.toolCalls.map(tc => {
      const res = toolResultsRef.current.get(tc.id);
      return res
        ? {
            ...tc,
            output: res.output,
            details: tc.details || res.details || undefined,
            status: (res.isError ? 'error' : 'success') as ToolCallData['status'],
          }
        : tc;
    });
    return { ...msg, toolCalls };
  };

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
          // Fresh turn: discard any accumulated tool outputs from the previous
          // turn so results always pair with the current tool calls.
          toolResultsRef.current.clear();
          lastToolMessageRef.current = null;
          callbacksRef.current.onAgentStart?.();
          break;
        case 'message_start':
        case 'message_update': {
          const msg = data.message as Record<string, unknown> | undefined;
          if (!msg) break;
          // Tool results arrive as standalone toolResult messages; hoist their
          // text into the accumulated map instead of rendering them as an
          // assistant content bubble.
          if (msg.role === 'toolResult') {
            const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
            const text = extractTextFromContent(msg.content);
            const details = (msg.details && typeof msg.details === 'object' ? msg.details : undefined) as Record<string, any> | undefined;
            if (callId) {
              toolResultsRef.current.set(callId, { output: text, details });
            }
            break;
          }
          if (msg.role !== 'user') {
            const converted = toChatMessage(msg);
            if (converted) callbacksRef.current.onMessageUpdate?.(converted);
          }
          break;
        }
        case 'message_end': {
          const completed = data.message as Record<string, unknown> | undefined;
          if (!completed) break;
          // toolResult messages are already folded into the tool output map;
          // never render them as a standalone assistant bubble.
          if (completed.role === 'toolResult') {
            const callId = typeof completed.toolCallId === 'string' ? completed.toolCallId : undefined;
            const text = extractTextFromContent(completed.content);
            const details = (completed.details && typeof completed.details === 'object' ? completed.details : undefined) as Record<string, any> | undefined;
            if (callId) {
              toolResultsRef.current.set(callId, { output: text, details });
            }
            break;
          }
          // Notices (custom role) are rendered from their message_start /
          // message_update frames (deduped by id in the timeline); emitting
          // them again on message_end duplicates the notice row.
          if (completed.role === 'custom') break;
          if (completed.role !== 'toolResult' && completed.role !== 'user') {
            const converted = toChatMessage(completed, false);
            if (converted) {
              const paired = pairToolOutputs(converted);
              if (paired.toolCalls?.length) lastToolMessageRef.current = paired;
              callbacksRef.current.onMessageEnd?.(paired);
            }
          }
          break;
        }
        case 'tool_execution_start': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          if (callId) toolResultsRef.current.set(callId, { output: '' });
          if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
            lastToolMessageRef.current = { ...lastToolMessageRef.current, toolCalls: lastToolMessageRef.current.toolCalls.map(tc => ({ ...tc, status: 'running' as ToolCallData['status'] })) };
            callbacksRef.current.onMessageUpdate?.(lastToolMessageRef.current);
          }
          break;
        }
        case 'tool_execution_update': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          const partial = toolResultText(data.partialResult);
          if (callId && partial) {
            const prev = toolResultsRef.current.get(callId)?.output ?? '';
            toolResultsRef.current.set(callId, { output: prev + partial });
            if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
              callbacksRef.current.onMessageUpdate?.(pairToolOutputs(lastToolMessageRef.current));
            }
          }
          break;
        }
        case 'tool_execution_end': {
          const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          const result = toolResultText(data.result);
          const isError = data.isError === true;
          const details = (data.details && typeof data.details === 'object' ? data.details : undefined) as Record<string, any> | undefined;
          if (callId) {
            // The final result is complete; replace accumulated partials so
            // the displayed output is not duplicated (partials + final).
            toolResultsRef.current.set(callId, { output: result, isError, details });
            if (lastToolMessageRef.current?.toolCalls?.some(tc => tc.id === callId)) {
              callbacksRef.current.onMessageUpdate?.(pairToolOutputs(lastToolMessageRef.current));
            }
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
        case 'extension_ui_request': {
          callbacksRef.current.onExtensionUiRequest?.(data as unknown as IncomingExtensionUiRequest);
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
    let cancelled = false;
    // Reload/remount recovery: the omp process keeps running server-side
    // after a page refresh, so a mid-run session must reattach its SSE stream
    // or the in-flight response appears frozen. Probe get_state; when the
    // wrapper reports streaming/prompt-running, reconnect and let the caller
    // resume the generating UI.
    fetch(`/api/agent/${encodeURIComponent(sessionId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { running?: boolean; state?: { isStreaming?: boolean; isPromptRunning?: boolean } } | null) => {
        if (cancelled || !data?.running) return;
        const state = data.state;
        if (state && (state.isStreaming || state.isPromptRunning)) {
          connect(sessionId);
          callbacksRef.current.onResumeStream?.();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [sessionId, disconnect, connect]);

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

  /** Spawn a brand-new omp session and send the first prompt: ensure_session
   *  first (returns omp's real session id), attach the SSE stream, then send
   *  the prompt through the existing session route so no agent events are
   *  missed. Returns the new session id on success, or null on failure — the
   *  caller adopts the id as the active session. */
  const sendNewPrompt = useCallback(async (
    message: string,
    cwd: string,
    images?: { data: string; mimeType: string }[],
  ): Promise<string | null> => {
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      const created = await fetch('/api/agent/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ensure_session', cwd }),
      });
      const createdBody = (await created.json().catch(() => ({}))) as { success?: boolean; sessionId?: string; error?: string };
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
      return sid;
    } catch (e) {
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return null;
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

  return { ...state, sendPrompt, sendNewPrompt, abort, setModel, setThinkingLevel, respondToExtensionUi, disconnect };
}
