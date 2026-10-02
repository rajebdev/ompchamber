/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prompt delivery for the live omp bridge: warm the session up, attach the
 * event stream, POST the prompt, then signal the sidebars the moment it is
 * dispatched.
 *
 * The signal is the point: the server writes the live `stream` row when it
 * dispatches the prompt, so waiting for `agent_start` (spawn + ack round trip)
 * would leave the sidebar spinner dark for seconds after the user hit send.
 * The client half of that is the optimistic mark armed on the click itself
 * (`setStreamPending`), which covers the round trip the server's write cannot:
 * see `stream-overlay.ts`. Extracted from useOmpAgent so that hook stays under
 * the repo's per-file size ceiling.
 */

import { useCallback } from 'preact/hooks';
import type { Dispatch, SetStateAction } from 'preact/compat';
import { setStreamPending } from '@/client/hooks/chat/omp/stream-overlay';
import type { AgentImage, OmpAgentState } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

export interface OmpPromptSenderDeps {
  /** Live session id the prompt targets; the caller mirrors its prop into it. */
  sessionIdRef: { current: string | null };
  /** Attach the event stream to a spawned session. */
  connect: (sessionId: string) => void;
  setState: Dispatch<SetStateAction<OmpAgentState>>;
}

export interface OmpPromptSender {
  sendPrompt: (message: string, images?: AgentImage[], options?: { accessMode?: ApprovalMode }) => Promise<boolean>;
  sendNewPrompt: (
    message: string,
    cwd: string,
    images?: AgentImage[],
    composerOptions?: {
      model?: { provider: string; modelId: string } | null;
      thinkingLevel?: string | null;
      accessMode?: ApprovalMode;
      /** Plan/goal picks made on the pending view. Applied through the spawn
       *  ENVIRONMENT, because a brand-new session has no transcript for the
       *  extension to restore from — see the route's `modes` handling. */
      modes?: { plan: boolean; goal: boolean } | null;
    },
  ) => Promise<{ sessionId: string; model: { provider: string; modelId: string } | null } | null>;
}

export function useOmpPromptSender(deps: OmpPromptSenderDeps): OmpPromptSender {
  const { sessionIdRef, connect, setState } = deps;

  /** Send a prompt to the omp session via the RPC bridge. */
  const sendPrompt = useCallback(async (
    message: string,
    images?: AgentImage[],
    options?: { accessMode?: ApprovalMode },
  ) => {
    const sid = sessionIdRef.current;
    if (!sid) return false;
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    // The sidebar spinner starts on the CLICK, not when the server's dispatch
    // write lands a spawn/resume round trip later; the chat's own
    // `isGenerating` cannot carry this across a session switch.
    setStreamPending(sid, true);
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
        // `session_busy`: the ack timed out behind a still-running turn, so the
        // prompt may already be accepted — never resend it automatically.
        setStreamPending(sid, false);
        setState((prev) => ({ ...prev, isGenerating: false, error: body.error ?? `HTTP ${res.status}` }));
        return false;
      }
      // Re-arm on the accepted dispatch: the authoritative row exists now, so
      // the mark's clock moves to a moment a later snapshot can be trusted
      // against (see `releaseObservedPending`).
      setStreamPending(sid, true);
      // Tell the sidebars to re-read the session list now — the server wrote
      // this session's live `stream` row at dispatch. Revalidation is
      // leading-edge throttled, so this lands immediately.
      window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
      return true;
    } catch (e) {
      setStreamPending(sid, false);
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }, [connect, sessionIdRef, setState]);

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
    images?: AgentImage[],
    composerOptions?: {
      model?: { provider: string; modelId: string } | null;
      thinkingLevel?: string | null;
      accessMode?: ApprovalMode;
      modes?: { plan: boolean; goal: boolean } | null;
    },
  ): Promise<{ sessionId: string; model: { provider: string; modelId: string } | null } | null> => {
    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    // The real id does not exist until `ensure_session` answers, so the mark
    // can only be armed past that point — the spawn itself is covered by the
    // pending view, and nothing on the sidebar can name the session yet.
    let sid: string | null = null;
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
          // Plan/goal picks from the pending view. Omitted when the user made
          // none, so a spawn with no selection behaves exactly as before.
          ...(composerOptions?.modes ? { modes: composerOptions.modes } : {}),
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
      sid = createdBody.sessionId;
      connect(sid);
      setStreamPending(sid, true);
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
        setStreamPending(sid, false);
        setState((prev) => ({ ...prev, isGenerating: false, error: body.error ?? `HTTP ${res.status}` }));
        return null;
      }
      // Same dispatch-time signal as sendPrompt, and the same re-arm: the new
      // session's live badge must not wait for agent_start + the first JSONL
      // write.
      setStreamPending(sid, true);
      window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
      return { sessionId: sid, model: createdBody.model ?? null };
    } catch (e) {
      if (sid) setStreamPending(sid, false);
      setState((prev) => ({ ...prev, isGenerating: false, error: e instanceof Error ? e.message : String(e) }));
      return null;
    }
  }, [connect, setState]);

  return { sendPrompt, sendNewPrompt };
}
