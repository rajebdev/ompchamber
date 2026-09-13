/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message-send core for the chamber chat: reads text/image attachments, builds
 * the optimistic user + AI placeholder bubbles, then routes the send through
 * the live omp agent bridge (existing/new session) or the mock SSE stream.
 * Extracted from useChatTimeline so that hook stays under the size ceiling.
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Attachment, ChatMessageData } from '@/types';
import { streamChatResponse } from '@/hooks/chat/stream';
import { isTextAttachmentFile, composeMessageWithTextAttachments } from '@/lib/chat/attachments';
import { loadAgentNames } from '@/lib/chat/composer/client';
import { translateAgentMentions, translateFileMentions } from '@/lib/chat/composer/translate';
import { normalizeNoticePositions } from '@/lib/chat/order';
import { createMockStreamCallbacks } from '@/lib/chat/timeline/stream-callbacks';
import type { useOmpAgent } from '@/hooks/chat/omp';

type OmpAgent = ReturnType<typeof useOmpAgent>;

type TextFileAttachment = Parameters<typeof composeMessageWithTextAttachments>[1][number];

/**
 * Build the outgoing prompt. `@agent` mentions are rewritten into an explicit
 * task-tool delegation directive at send time (oh-my-pi has no `@agent`
 * syntax); translation failures fall back to the raw prompt.
 */
async function buildPromptText(text: string, textFiles: TextFileAttachment[]): Promise<string> {
  let translated = text;
  try {
    const names = await loadAgentNames();
    if (names.length > 0) translated = translateAgentMentions(text, names).text;
  } catch {
    // keep the raw prompt
  }
  // File mentions are namespaced (`@file:`) by the picker; strip the namespace
  // only after the agent pass so `@file:<name>` is never mistaken for `@agent`.
  return composeMessageWithTextAttachments(translateFileMentions(translated), textFiles);
}

export interface ChatTimelineSendDeps {
  folders: any[];
  selectedFolderId: number | null;
  sessionId: string | null;
  isOmpSession: boolean;
  appSettings: Record<string, any>;
  ompAgent: OmpAgent;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  persistMessages: (messages: any[]) => void;
  setGenerating: (v: boolean) => void;
  setGeneratingVerb: (v: string) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  aiPlaceholderIdRef: { current: string | null };
  adoptedSessionIdRef: { current: string | null };
  optimisticUserIdRef: { current: string | null };
  pendingUserDisplaysRef: { current: { sent: string; display: string }[] };
  setSessionModel: (model: { provider: string; modelId: string } | null) => void;
  abortControllerRef: { current: AbortController | null };
  setInputValue: (v: string) => void;
  setSearchParams: (fn: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void;
}

export interface ChatTimelineSendResult {
  prepareDeliverable: (text: string, attachments: Attachment[]) => Promise<{ promptText: string; images?: { data: string; mimeType: string }[] }>;
  steerOmpAgent: (text: string, attachments: Attachment[]) => Promise<void>;
  executeSend: (text: string, attachments: Attachment[]) => Promise<void>;
}

export function useChatTimelineSend(deps: ChatTimelineSendDeps): ChatTimelineSendResult {
  const {
    folders,
    selectedFolderId,
    sessionId,
    isOmpSession,
    appSettings,
    ompAgent,
    setLocalMessages,
    persistMessages,
    setGenerating,
    setGeneratingVerb,
    scrollToBottom,
    aiPlaceholderIdRef,
    adoptedSessionIdRef,
    optimisticUserIdRef,
    pendingUserDisplaysRef,
    setSessionModel,
    abortControllerRef,
    setInputValue,
    setSearchParams,
  } = deps;

  // Reads text-file attachments and builds the prompt + image payload for an
  // omp delivery (mirror of executeSend's assembly block).
  const prepareDeliverable = useCallback(async (
    text: string,
    attachments: Attachment[],
  ): Promise<{ promptText: string; images?: { data: string; mimeType: string }[] }> => {
    const textFileContents = new Map<string, string>();
    try {
      await Promise.all(
        attachments
          .filter(a => isTextAttachmentFile(a.file))
          .map(async a => {
            textFileContents.set(a.id, await a.file.text());
          })
      );
    } catch {
      // Fall back to prompt without inlined contents if a file cannot be read.
    }
    const textFiles = attachments
      .filter(a => textFileContents.has(a.id))
      .map(a => ({
        name: a.file.name,
        mimeType: a.file.type,
        content: textFileContents.get(a.id) as string,
        size: a.file.size,
      }));
    const promptText = await buildPromptText(text, textFiles);
    pendingUserDisplaysRef.current = [...pendingUserDisplaysRef.current.slice(-7), { sent: promptText, display: text }];
    const images = attachments
      .filter(a => a.file.type.startsWith('image/') && a.dataBase64)
      .map(a => ({ data: a.dataBase64 as string, mimeType: a.file.type }));
    return { promptText, images: images.length ? images : undefined };
  }, []);

  // Steer the running omp agent with a fresh prompt (interrupt-and-reply).
  const steerOmpAgent = useCallback(async (text: string, attachments: Attachment[]) => {
    const { promptText, images } = await prepareDeliverable(text, attachments);
    const ok = await ompAgent.sendInterruptAndReply(promptText, images);
    if (!ok) setInputValue(text);
  }, [ompAgent, prepareDeliverable, setInputValue]);

  const executeSend = useCallback(async (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const aiPlaceholderId = `msg-${Date.now() + 1}-ai`;

    // Read text-file contents once: used for the editor (attachment.content)
    // and for inlining into the prompt (mirror omp-web).
    const textFileContents = new Map<string, string>();
    try {
      await Promise.all(
        attachments
          .filter(a => isTextAttachmentFile(a.file))
          .map(async a => {
            textFileContents.set(a.id, await a.file.text());
          })
      );
    } catch {
      // Fall back to prompt without inlined contents if a file cannot be read.
    }

    const newUserMsg: ChatMessageData = {
      id: userMsgId,
      role: 'user',
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({
        name: a.file.name,
        preview: a.dataBase64 ? `data:${a.file.type};base64,${a.dataBase64}` : a.preview,
        type: a.file.type,
        size: a.file.size,
        content: textFileContents.get(a.id),
      }))
    };

    const initialAiMsg: ChatMessageData = {
      id: aiPlaceholderId,
      role: 'ai',
      date: `Today, ${time}`,
      content: '',
    };

    setLocalMessages(prev => {
      const next = normalizeNoticePositions([...prev, newUserMsg, initialAiMsg]);
      persistMessages(next.filter(m => m.id !== aiPlaceholderId));
      return next;
    });

    setGenerating(true);
    const verbs = ['Synthesizing solution', 'Deep reasoning', 'Architecting patch', 'Compiling edge routes'];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Real mode: route through the omp agent RPC bridge + SSE stream.
    if (isOmpSession) {
      aiPlaceholderIdRef.current = aiPlaceholderId;
      optimisticUserIdRef.current = userMsgId;
      const images = attachments
        .filter(a => a.file.type.startsWith('image/') && a.dataBase64)
        .map(a => ({ data: a.dataBase64 as string, mimeType: a.file.type }));
      // Inline text-file contents into the prompt (mirror omp-web): the model
      // sees the full file content as fenced blocks, not just the filename.
      const textFiles = attachments
        .filter(a => textFileContents.has(a.id))
        .map(a => ({
          name: a.file.name,
          mimeType: a.file.type,
          content: textFileContents.get(a.id) as string,
          size: a.file.size,
        }));
      const promptText = await buildPromptText(text, textFiles);
      const ok = await ompAgent.sendPrompt(promptText, images.length ? images : undefined);
      if (!ok) {
        // Roll back the optimistic bubbles on a failed send.
        setLocalMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== aiPlaceholderId));
        aiPlaceholderIdRef.current = null;
        optimisticUserIdRef.current = null;
        setGenerating(false);
      }
      return;
    }

    // No active session (fresh "New Session"): in real mode spawn a brand-new
    // omp session and adopt its id; fall back to the mock/simulated path only
    // when the spawn fails (e.g. MOCK=true or no workspace context).
    if (!isOmpSession) {
      const currentFolder = folders.find(f => String(f.id) === String(selectedFolderId));
      const cwd = currentFolder?.project_path || currentFolder?.name;
      if (cwd) {
        const images = attachments
          .filter(a => a.file.type.startsWith('image/') && a.dataBase64)
          .map(a => ({ data: a.dataBase64 as string, mimeType: a.file.type }));
        const textFiles = attachments
          .filter(a => textFileContents.has(a.id))
          .map(a => ({
            name: a.file.name,
            mimeType: a.file.type,
            content: textFileContents.get(a.id) as string,
            size: a.file.size,
          }));
        const promptText = await buildPromptText(text, textFiles);
        optimisticUserIdRef.current = userMsgId;
        const spawned = await ompAgent.sendNewPrompt(promptText, cwd, images.length ? images : undefined);
        if (spawned) {
          adoptedSessionIdRef.current = spawned.sessionId;
          aiPlaceholderIdRef.current = aiPlaceholderId;
          if (spawned.model) setSessionModel(spawned.model);
          fetch(`/api/chat/${encodeURIComponent(spawned.sessionId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [newUserMsg] }),
          }).catch(err => console.error('Error persisting spawned user turn:', err));
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('sessionId', spawned.sessionId);
            return next;
          }, { replace: true });
          // The agent_start event refreshes the session metadata/sidebar once
          // the JSONL has the user turn; no immediate refresh is needed here.
          return;
        }
      }
    }

    // Mock / chamber-created session: existing Gemini/simulated SSE path.
    // Cancel any previous stream
    optimisticUserIdRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentFolder = folders.find(f => String(f.id) === String(selectedFolderId));
    const workspaceName = currentFolder?.name || 'Workspace';

    await streamChatResponse(
      {
        sessionId: sessionId || `session-${Date.now()}`,
        prompt: text,
        workspaceName,
        attachments,
        signal: abortController.signal,
      },
      createMockStreamCallbacks({
        aiPlaceholderId,
        setLocalMessages,
        persistMessages,
        setGenerating,
        abortControllerRef,
        appSettings,
        scrollToBottom,
      })
    );
  }, [appSettings, folders, isOmpSession, ompAgent, selectedFolderId, sessionId, scrollToBottom, persistMessages, setSessionModel]);

  return { prepareDeliverable, steerOmpAgent, executeSend };
}
