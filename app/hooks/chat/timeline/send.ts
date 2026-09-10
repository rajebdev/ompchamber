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
import { normalizeNoticePositions } from '@/lib/chat/order';
import { createMockStreamCallbacks } from '@/lib/chat/timeline/stream-callbacks';
import type { useOmpAgent } from '@/hooks/chat/omp';

type OmpAgent = ReturnType<typeof useOmpAgent>;

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
    const promptText = composeMessageWithTextAttachments(text, textFiles);
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
      const promptText = composeMessageWithTextAttachments(text, textFiles);
      const ok = await ompAgent.sendPrompt(promptText, images.length ? images : undefined);
      if (!ok) {
        // Roll back the optimistic bubbles on a failed send.
        setLocalMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== aiPlaceholderId));
        aiPlaceholderIdRef.current = null;
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
        const promptText = composeMessageWithTextAttachments(text, textFiles);
        const newSessionId = await ompAgent.sendNewPrompt(promptText, cwd, images.length ? images : undefined);
        if (newSessionId) {
          adoptedSessionIdRef.current = newSessionId;
          aiPlaceholderIdRef.current = aiPlaceholderId;
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('sessionId', newSessionId);
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
  }, [appSettings, folders, isOmpSession, ompAgent, selectedFolderId, sessionId, scrollToBottom, persistMessages]);

  return { prepareDeliverable, steerOmpAgent, executeSend };
}
