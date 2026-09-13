/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds the live-omp-agent callback object consumed by useChatTimeline's
 * useOmpAgent(...). Extracted so the timeline hook stays under the repo's
 * per-file size ceiling. Every closure here mutates the caller's state/refs,
 * so they are passed in as a single deps record and read as `deps.*` — the
 * captured semantics (including side effects inside setState updaters, e.g.
 * aiPlaceholderIdRef reset + persistMessages on message_end) are unchanged.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageData } from '@/types';
import type { ExtensionUiDialogRequest, IncomingExtensionUiRequest, OmpAgentCallbacks } from '@/hooks/chat/omp';
import { normalizeNoticePositions } from '@/lib/chat/order';
import { triggerChatCompletionSound } from '@/hooks/ui/notification-sound';

export interface OmpAgentCallbacksDeps {
  removeDeliveredFromQueue: (text: string) => void;
  setGenerating: (v: boolean) => void;
  setGeneratingVerb: (v: string) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  adoptedSessionIdRef: { current: string | null };
  sessionIdRef: { current: string | null };
  metaRefreshedRef: { current: string | null };
  refreshSessionMeta: (sid: string) => void;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  aiPlaceholderIdRef: { current: string | null };
  optimisticUserIdRef: { current: string | null };
  persistMessages: (messages: any[]) => void;
  abortControllerRef: { current: AbortController | null };
  appSettings: Record<string, any>;
  setExtensionDialog: Dispatch<SetStateAction<ExtensionUiDialogRequest | null>>;
}

export function createOmpAgentCallbacks(deps: OmpAgentCallbacksDeps): OmpAgentCallbacks {
  const {
    removeDeliveredFromQueue,
    setGenerating,
    setGeneratingVerb,
    scrollToBottom,
    adoptedSessionIdRef,
    sessionIdRef,
    metaRefreshedRef,
    refreshSessionMeta,
    setLocalMessages,
    aiPlaceholderIdRef,
    optimisticUserIdRef,
    persistMessages,
    abortControllerRef,
    appSettings,
    setExtensionDialog,
  } = deps;

  return {
    // A queued steer/follow-up text was picked up by the agent (user turn
    // arrived) — drop it from whichever queue mirrors it so the panel stays
    // truthful without a chat bubble for every delivery.
    onQueuedMessageDelivered: (text) => {
      removeDeliveredFromQueue(text);
    },
    onAgentStart: () => {
      setGenerating(true);
      setGeneratingVerb('Deep reasoning');
      setTimeout(() => scrollToBottom('smooth'), 50);
      const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
      if (sid && metaRefreshedRef.current !== sid) {
        metaRefreshedRef.current = sid;
        setTimeout(() => refreshSessionMeta(sid), 100);
      }
    },
    // Reload recovery: the omp process kept running server-side, so the SSE
    // stream is reattached and the generating UI must resume (the timeline
    // fetch already loaded the committed messages; live updates continue).
    onResumeStream: () => {
      setGenerating(true);
      setGeneratingVerb('Deep reasoning');
      setTimeout(() => scrollToBottom('smooth'), 50);
    },
    // omp-web mirrors this exactly: streaming updates live in a SEPARATE
    // slot that is replaced wholesale on every update (never merged into the
    // committed list), and only flushed to history on message_end. omp's
    // message frames are timestamp-identified, not id-identified.
    onMessageUpdate: (msg) => {
      setLocalMessages(prev => {
        const placeholderId = aiPlaceholderIdRef.current;
        // Notice rows (e.g. background job done, system alerts) belong chronologically
        // right before the next AI response, NEVER backwards before the initiating user message.
        if (msg.notice) {
          if (prev.some(m => m.id === msg.id)) return prev;
          // If an active AI placeholder is generating at the tail, insert notice immediately before it
          if (placeholderId && prev.some(m => m.id === placeholderId)) {
            const pIdx = prev.findIndex(m => m.id === placeholderId);
            return normalizeNoticePositions([...prev.slice(0, pIdx), msg, ...prev.slice(pIdx)]);
          }
          return normalizeNoticePositions([...prev, msg]);
        }
        // User turns from the stream (steering abort_and_prompt, queue
        // follow-up deliveries) carry no optimistic bubble — append them
        // wholesale. Never merge into the AI placeholder slot: that would
        // overwrite the streaming AI segment (the omp user id also differs).
        if (msg.role === 'user') {
          if (prev.some(m => m.id === msg.id)) return prev;
          // omp echoes the prompt with a different id than the optimistic
          // bubble (`msg-…-user` vs omp's timestamp id), so reconcile in place
          // instead of appending a duplicate when the echo arrives.
          const pendingId = optimisticUserIdRef.current;
          if (pendingId) {
            const pIdx = prev.findIndex(m => m.id === pendingId);
            if (pIdx !== -1) {
              optimisticUserIdRef.current = null;
              const reconciled: ChatMessageData = {
                ...msg,
                id: msg.id,
                date: prev[pIdx].date,
                attachments: msg.attachments?.length ? msg.attachments : prev[pIdx].attachments,
              };
              return [...prev.slice(0, pIdx), reconciled, ...prev.slice(pIdx + 1)];
            }
          }
          // Steering/follow-up user turns have no optimistic bubble → append.
          if (placeholderId && prev.some(m => m.id === placeholderId)) {
            const pIdx = prev.findIndex(m => m.id === placeholderId);
            return [...prev.slice(0, pIdx), msg, ...prev.slice(pIdx)];
          }
          return [...prev, msg];
        }
        // Assistant content started → the optimistic user echo window is closed.
        optimisticUserIdRef.current = null;
        if (placeholderId && prev.some(m => m.id === placeholderId)) {
          return prev.map(m => (m.id === placeholderId ? msg : m));
        }
        // omp emits one message_update per segment, each a distinct message
        // id carrying that segment's FULL accumulated content. Same id →
        // in-place update; a new id → append (replacing the trailing AI
        // message would wipe the previous segment's thinking/tool bubbles).
        const existingIdx = prev.findIndex(m => m.id === msg.id);
        if (existingIdx !== -1) {
          return [...prev.slice(0, existingIdx), msg, ...prev.slice(existingIdx + 1)];
        }
        return [...prev, msg];
      });
      scrollToBottom('smooth');
    },
    onMessageEnd: (msg) => {
      setLocalMessages(prev => {
        const placeholderId = aiPlaceholderIdRef.current;
        // User turn finalization (steering/follow-up): same contract as the
        // update path — append-only, deduped by omp id, placeholder untouched.
        if (msg.role === 'user') {
          const pendingId = optimisticUserIdRef.current;
          let next: ChatMessageData[];
          if (prev.some(m => m.id === msg.id)) {
            next = prev.map(m => (m.id === msg.id ? msg : m));
          } else if (pendingId && prev.some(m => m.id === pendingId)) {
            optimisticUserIdRef.current = null;
            next = prev.map(m => (m.id === pendingId
              ? { ...msg, id: msg.id, date: m.date, attachments: msg.attachments?.length ? msg.attachments : m.attachments }
              : m));
          } else if (placeholderId && prev.some(m => m.id === placeholderId)) {
            const pIdx = prev.findIndex(m => m.id === placeholderId);
            next = [...prev.slice(0, pIdx), msg, ...prev.slice(pIdx)];
          } else {
            next = [...prev, msg];
          }
          persistMessages(next);
          return next;
        }
        let updated: ChatMessageData[];
        if (placeholderId && prev.some(m => m.id === placeholderId)) {
          updated = prev.map(m => (m.id === placeholderId ? msg : m));
        } else {
          // omp emits one message_end per segment, each a distinct message
          // id carrying that segment's FULL accumulated content. Same id →
          // in-place finalize; a new id → append so segments of the same
          // turn stack (thinking/tool bubbles from earlier segments survive).
          const existingIdx = prev.findIndex(m => m.id === msg.id);
          if (existingIdx !== -1) {
            updated = [...prev.slice(0, existingIdx), msg, ...prev.slice(existingIdx + 1)];
          } else {
            updated = [...prev, msg];
          }
        }
        aiPlaceholderIdRef.current = null;
        persistMessages(updated);
        return updated;
      });
    },
    onAgentEnd: () => {
      setGenerating(false);
      abortControllerRef.current = null;
      optimisticUserIdRef.current = null;
      triggerChatCompletionSound(appSettings);
      setTimeout(() => scrollToBottom('smooth'), 50);
      // The omp JSONL has the final title/messages now — refresh session
      // metadata so navbar/context panel show the real title.
      const sid = sessionIdRef.current;
      if (sid) refreshSessionMeta(sid);
    },
    onModelChanged: () => {
      // omp's model_changed frame carries no payload — re-read the session
      // metadata so the indicator/composer reflect the live model.
      const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
      if (sid) setTimeout(() => refreshSessionMeta(sid), 150);
    },
    onPromptError: (errorMessage) => {
      setGenerating(false);
      abortControllerRef.current = null;
      console.error('OMP prompt error:', errorMessage);
    },
    onNotice: (_level, message) => {
      console.info('OMP notice:', message);
    },
    onExtensionUiRequest: (request: IncomingExtensionUiRequest) => {
      if (request.method === 'select' || request.method === 'confirm' || request.method === 'input' || request.method === 'editor') {
        setExtensionDialog(request);
      } else if (request.method === 'cancel') {
        setExtensionDialog((current) => (current?.id === request.targetId ? null : current));
      }
    },
  };
}
