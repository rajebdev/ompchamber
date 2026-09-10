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

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Attachment, ChatMessageData } from '@/types';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import type { ExtensionUiDialogRequest } from '@/types/omp/agent';
import type { useOmpAgent } from '@/hooks/chat/omp';

type OmpAgent = ReturnType<typeof useOmpAgent>;

export interface ChatTimelineActionsDeps {
  inputValue: string;
  setInputValue: (v: string) => void;
  setInputAttachments: Dispatch<SetStateAction<Attachment[]>>;
  isGenerating: boolean;
  isOmpSession: boolean;
  appSettings: Record<string, any>;
  setMessageQueue: (updater: SetStateAction<QueuedMessage[]>) => void;
  executeSend: (text: string, attachments: Attachment[]) => Promise<void>;
  steerOmpAgent: (text: string, attachments: Attachment[]) => Promise<void>;
  prepareDeliverable: (text: string, attachments: Attachment[]) => Promise<{ promptText: string; images?: { data: string; mimeType: string }[] }>;
  ompAgent: OmpAgent;
  abortControllerRef: { current: AbortController | null };
  setGenerating: (v: boolean) => void;
  persistMessages: (messages: any[]) => void;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  setSearchParams: (fn: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void;
  setExtensionDialog: Dispatch<SetStateAction<ExtensionUiDialogRequest | null>>;
}

export interface ChatTimelineActionsResult {
  handleSend: (attachments: Attachment[], options?: { steering?: boolean }) => Promise<void>;
  handleEditQueueItem: (item: QueuedMessage) => void;
  handleSendNowQueueItem: (item: QueuedMessage) => Promise<void>;
  handleUndo: (msgId: string, content?: string) => void;
  handleRetry: (msgId: string) => void;
  submitNewChat: (text: string, attachments: any[]) => void;
  stopGenerating: () => void;
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
    appSettings,
    setMessageQueue,
    executeSend,
    steerOmpAgent,
    prepareDeliverable,
    ompAgent,
    abortControllerRef,
    setGenerating,
    persistMessages,
    setLocalMessages,
    setSearchParams,
    setExtensionDialog,
  } = deps;

  const handleSend = useCallback(async (attachments: Attachment[], options?: { steering?: boolean }) => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

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
      const queuedItem = {
        id: `queue-${Date.now()}`,
        text: textToSend,
        attachments,
      };
      if (isOmpSession) {
        // omp owns the follow-up queue; keep a client mirror for the panel.
        setInputValue('');
        setMessageQueue(prev => [...prev, queuedItem]);
        const { promptText, images } = await prepareDeliverable(textToSend, attachments);
        const ok = await ompAgent.sendFollowUp(promptText, images);
        if (!ok) setMessageQueue(q => q.filter(i => i.id !== queuedItem.id));
      } else {
        setMessageQueue(prev => [...prev, queuedItem]);
        setInputValue('');
      }
      return;
    }

    setInputValue('');
    executeSend(textToSend, attachments);
  }, [inputValue, isGenerating, executeSend, setMessageQueue, isOmpSession, appSettings, steerOmpAgent, prepareDeliverable, ompAgent, setInputValue, abortControllerRef, setGenerating]);

  const handleEditQueueItem = useCallback((item: QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  }, [setMessageQueue, setInputValue, setInputAttachments]);

  const handleSendNowQueueItem = useCallback(async (item: QueuedMessage) => {
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
        setTimeout(() => executeSend(item.text, item.attachments), 0);
      }
    } else {
      executeSend(item.text, item.attachments);
    }
  }, [isGenerating, executeSend, setMessageQueue, isOmpSession, steerOmpAgent, abortControllerRef, setGenerating]);

  const handleUndo = useCallback((msgId: string, content?: string) => {
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

    setLocalMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      const next = idx !== -1 ? prev.slice(0, idx) : prev;
      persistMessages(next);
      return next;
    });
  }, [isGenerating, persistMessages, isOmpSession, ompAgent, abortControllerRef, setGenerating, setInputValue, setLocalMessages]);

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
          executeSend(userMsg.content, (userMsg.attachments as any) || []);
        }, 0);
        const next = prev.slice(0, aiIdx);
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

  const stopGenerating = useCallback(() => {
    if (isOmpSession) {
      void ompAgent.abort();
    } else if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
  }, [isOmpSession, ompAgent, abortControllerRef, setGenerating]);

  const handleThinkingLevelChange = useCallback((level: string) => {
    if (level === 'auto') return;
    void ompAgent.setThinkingLevel(level);
  }, [ompAgent]);

  const handleModelChange = useCallback((provider: string, modelId: string) => {
    void ompAgent.setModel(provider, modelId);
  }, [ompAgent]);

  const closeExtensionDialog = useCallback(() => {
    setExtensionDialog(null);
  }, [setExtensionDialog]);

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
