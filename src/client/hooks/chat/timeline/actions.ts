/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Composer/action handlers for the chamber chat (send, send-now, edit/delete
 * queued items, undo, retry, new-chat, stop, model/thinking changes, close
 * dialog). Extracted from useChatTimeline so that hook stays under the repo's
 * per-file size ceiling. Everything these handlers need arrives via the deps
 * record — captured semantics are unchanged.
 */

import { useCallback } from 'preact/hooks';
import type { Dispatch, SetStateAction } from 'preact/compat';
import type { Attachment, ChatMessageData, OmpAgentHandle, QueuedMessageModel } from '@/shared/types';
import type { QueuedMessage } from '@/client/components/workspace/chat-timeline/QueueList';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

export interface ChatTimelineActionsDeps {
  inputValue: string;
  setInputValue: (v: string) => void;
  setInputAttachments: Dispatch<SetStateAction<Attachment[]>>;
  isGenerating: boolean;
  isOmpSession: boolean;
  /** Active session id (null on pending "new-…"); the omp undo path posts the
   *  rewind against it. */
  sessionId: string | null;
  appSettings: Record<string, any>;
  messageQueue: QueuedMessage[];
  setMessageQueue: (updater: SetStateAction<QueuedMessage[]>) => void;
  executeSend: (text: string, attachments: Attachment[], options?: { model?: QueuedMessageModel | null }) => Promise<void>;
  steerOmpAgent: (text: string, attachments: Attachment[]) => Promise<void>;
  ompAgent: OmpAgentHandle;
  abortControllerRef: { current: AbortController | null };
  setGenerating: (v: boolean) => void;
  /** Armed by Stop; the queue auto-process holds off while it is set. */
  stopHoldRef: { current: boolean };
  persistMessages: (messages: any[]) => void;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  /** Composer model picked before the omp session exists (pending "new-…"
   *  view); held here until the spawn command carries it. */
  pendingComposerModelRef: { current: { provider: string; modelId: string } | null };
  /** Same as pendingComposerModelRef, for the thinking level. */
  pendingThinkingLevelRef: { current: string | null };
  /** Live composer model/thinking mirror, snapshotted onto queued items so
   *  auto-delivery replays the exact settings. */
  composerModelRef: { current: { provider: string; modelId: string; thinkingLevel: string } | null };
  /** Global access-control mode, snapshotted onto queued items. */
  accessModeRef: { current: ApprovalMode };
  setSearchParams: (fn: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void;
  /** Advance the pending-dialog queue after the head was answered. */
  dismissExtensionDialog: () => void;
}

export interface ChatTimelineActionsResult {
  handleSend: (attachments: Attachment[], options?: { steering?: boolean }) => Promise<void>;
  handleEditQueueItem: (item: QueuedMessage) => void;
  handleSendNowQueueItem: (item: QueuedMessage) => Promise<void>;
  handleUndo: (msgId: string, content?: string) => Promise<boolean>;
  handleRetry: (msgId: string) => void;
  submitNewChat: (text: string, attachments: any[]) => void;
  /** Stop the active run; returns the number of queue items held back. */
  stopGenerating: () => number;
  handleThinkingLevelChange: (level: string) => void;
  handleModelChange: (provider: string, modelId: string) => void;
  closeExtensionDialog: () => void;
}

export function useChatTimelineActions(deps: ChatTimelineActionsDeps): ChatTimelineActionsResult {
  const {
    inputValue,
    setInputValue,
    setInputAttachments,
    isGenerating,
    isOmpSession,
    sessionId,
    appSettings,
    messageQueue,
    setMessageQueue,
    executeSend,
    steerOmpAgent,
    ompAgent,
    abortControllerRef,
    setGenerating,
    stopHoldRef,
    persistMessages,
    setLocalMessages,
    pendingComposerModelRef,
    pendingThinkingLevelRef,
    composerModelRef,
    accessModeRef,
    setSearchParams,
    dismissExtensionDialog,
  } = deps;

  const handleSend = useCallback(async (attachments: Attachment[], options?: { steering?: boolean }) => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

    // An explicit send disarms the Stop hold: the queue auto-process may
    // resume delivering after this run ends.
    stopHoldRef.current = false;

    if (isGenerating) {
      if (options?.steering) {
        // Explicit steering while a run is active.
        setInputValue('');
        if (isOmpSession) {
          await steerOmpAgent(textToSend, attachments);
        } else {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
          setGenerating(false);
          executeSend(textToSend, attachments);
        }
        return;
      }
      // Non-steering submit while running: honor the Follow-up Dispatch
      // setting — queue the follow-up, or steer the running agent.
      const behavior = appSettings.omp_chamber_settings?.followUpBehavior ?? appSettings.followUpBehavior ?? 'queue';
      if (behavior === 'steering' && isOmpSession) {
        setInputValue('');
        await steerOmpAgent(textToSend, attachments);
        return;
      }
      const composerPick = composerModelRef.current;
      const queuedItem: QueuedMessage = {
        id: `queue-${Date.now()}`,
        text: textToSend,
        attachments,
        // Snapshot the composer's model/thinking plus the live access mode so
        // auto-delivery runs the item with exactly these settings.
        model: composerPick
          ? { ...composerPick, accessMode: accessModeRef.current }
          : null,
      };
      // Both modes: hold the follow-up in the client queue. The panel is the
      // source of truth (editable, removable, survives reload via the
      // session-state blob); delivery happens when the run ends — the
      // auto-process effect sends the head item. For omp this replaces the
      // old immediate `follow_up` RPC, whose server-side queue the client
      // could never cancel (Stop kept executing it).
      setInputValue('');
      setMessageQueue(prev => [...prev, queuedItem]);
      return;
    }

    setInputValue('');
    executeSend(textToSend, attachments);
  }, [inputValue, isGenerating, executeSend, setMessageQueue, isOmpSession, appSettings, steerOmpAgent, setInputValue, abortControllerRef, setGenerating, stopHoldRef, composerModelRef, accessModeRef]);

  const handleEditQueueItem = useCallback((item: QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  }, [setMessageQueue, setInputValue, setInputAttachments]);

  const handleSendNowQueueItem = useCallback(async (item: QueuedMessage) => {
    // Explicit delivery also lifts the Stop hold.
    stopHoldRef.current = false;
    setMessageQueue(q => q.filter(i => i.id !== item.id));

    if (isGenerating) {
      if (isOmpSession) {
        void steerOmpAgent(item.text, item.attachments);
      } else {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setGenerating(false);
        setTimeout(() => executeSend(item.text, item.attachments, { model: item.model }), 0);
      }
    } else {
      executeSend(item.text, item.attachments, { model: item.model });
    }
  }, [isGenerating, executeSend, setMessageQueue, isOmpSession, steerOmpAgent, abortControllerRef, setGenerating, stopHoldRef]);

  const handleUndo = useCallback(async (msgId: string, content?: string): Promise<boolean> => {
    if (isGenerating) {
      if (isOmpSession) {
        void ompAgent.abort();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGenerating(false);
    }

    if (content) {
      setInputValue(content);
    }

    // Real omp sessions rewind in place: POST /api/chat/:sessionId/rewind
    // truncates the session JSONL before the turn (session id unchanged) and
    // respawns the agent on the truncated context. The chamber-side truncate
    // below would be undone by the next reload, because the timeline loads
    // from the omp JSONL — not from the chamber DB copy. Resolve false on
    // failure so the confirmation modal can stop its loading state instead of
    // closing on a no-op.
    if (isOmpSession && sessionId) {
      const res = await fetch(`/api/chat/${encodeURIComponent(sessionId)}/rewind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: msgId }),
      });
      if (!res.ok) return false;
      const next = await fetch(`/api/chat/${encodeURIComponent(sessionId)}`).then(r => r.json()).catch(() => null);
      const messages: ChatMessageData[] = next?.session?.messages ?? [];
      if (messages.length > 0) setLocalMessages(messages);
      return true;
    }

    setLocalMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      const next = idx !== -1 ? prev.slice(0, idx) : prev;
      persistMessages(next);
      return next;
    });
    return true;
  }, [isGenerating, isOmpSession, sessionId, persistMessages, abortControllerRef, setGenerating, setInputValue, setLocalMessages]);

  const handleRetry = useCallback((msgId: string) => {
    if (isGenerating) {
      if (isOmpSession) {
        void ompAgent.abort();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGenerating(false);
    }

    setLocalMessages(prev => {
      const aiIdx = prev.findIndex(m => m.id === msgId);
      if (aiIdx > 0 && prev[aiIdx - 1].role === 'user') {
        const userMsg = prev[aiIdx - 1];
        setTimeout(() => {
          // Committed history attachments carry the persisted display fields
          // only (no File); executeSend reads them defensively on replay.
          const attachments = (Array.isArray(userMsg.attachments) ? userMsg.attachments : []) as Attachment[];
          void executeSend(userMsg.content, attachments);
        }, 0);
        // Drop the user turn too — executeSend re-adds it optimistically; keeping
        // it here would render the same user message twice on every retry.
        const next = prev.slice(0, aiIdx - 1);
        persistMessages(next);
        return next;
      }
      return prev;
    });
  }, [isGenerating, executeSend, persistMessages, isOmpSession, ompAgent, abortControllerRef, setGenerating, setLocalMessages]);

  const submitNewChat = useCallback((text: string, attachments: any[]) => {
    // Client-side pending session id: the sidebar/navbar show a default title
    // immediately; the real omp session id replaces it on first send.
    const pendingId = `new-${Date.now()}`;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', pendingId);
      return next;
    }, { replace: true });

    setLocalMessages([]);
    setTimeout(() => {
      executeSend(text, attachments);
    }, 0);
  }, [setSearchParams, executeSend, setLocalMessages]);

  /** Stop the active run. Returns how many queue items were held back so the
   *  caller can surface a "still queued" toast. Stop-all semantics: the queue
   *  auto-process holds off until the next explicit send. */
  const stopGenerating = useCallback((): number => {
    stopHoldRef.current = true;
    if (isOmpSession) {
      void ompAgent.abort();
    } else if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
    return messageQueue.length;
  }, [isOmpSession, ompAgent, abortControllerRef, setGenerating, messageQueue.length, stopHoldRef]);

  const handleThinkingLevelChange = useCallback((level: string) => {
    if (level === 'auto') return;
    if (!isOmpSession) {
      pendingThinkingLevelRef.current = level;
      return;
    }
    void ompAgent.setThinkingLevel(level);
  }, [isOmpSession, ompAgent, pendingThinkingLevelRef]);

  const handleModelChange = useCallback((provider: string, modelId: string) => {
    if (!isOmpSession) {
      pendingComposerModelRef.current = { provider, modelId };
      return;
    }
    void ompAgent.setModel(provider, modelId);
  }, [isOmpSession, ompAgent, pendingComposerModelRef]);

  const closeExtensionDialog = useCallback(() => {
    dismissExtensionDialog();
  }, [dismissExtensionDialog]);

  return {
    handleSend,
    handleEditQueueItem,
    handleSendNowQueueItem,
    handleUndo,
    handleRetry,
    submitNewChat,
    stopGenerating,
    handleThinkingLevelChange,
    handleModelChange,
    closeExtensionDialog,
  };
}
