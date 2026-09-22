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

import { useCallback } from 'preact/hooks';
import type { Dispatch, SetStateAction } from 'preact/compat';
import type { Attachment, ChatMessageData, OmpAgentHandle, QueuedMessageModel } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { streamChatResponse } from '@/client/hooks/chat/stream';
import { composeMessageWithTextAttachments, isTextAttachmentFile } from '@/shared/lib/chat/attachments';
import { loadAgentNames } from '@/shared/lib/chat/composer/client';
import { translateAgentMentions, translateFileMentions } from '@/shared/lib/chat/composer/translate';
import { createMockStreamCallbacks } from '@/shared/lib/chat/timeline/stream-callbacks';
import { PHASE_VERBS } from '@/shared/lib/chat/timeline/tool-phrases';
import { formatClock } from '@/shared/lib/format/time';

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
  ompAgent: OmpAgentHandle;
  setLocalMessages: Dispatch<SetStateAction<ChatMessageData[]>>;
  persistMessages: (messages: any[]) => void;
  setGenerating: (v: boolean) => void;
  setGeneratingVerb: (v: string) => void;
  /** Follow-gated scroll for stream chunks. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Explicit user-action scroll: re-engages follow mode (send/steer). */
  jumpToBottom: (behavior?: ScrollBehavior) => void;
  aiPlaceholderIdRef: { current: string | null };
  adoptedSessionIdRef: { current: string | null };
  optimisticUserIdRef: { current: string | null };
  pendingUserDisplaysRef: { current: { sent: string; display: string }[] };
  setSessionModel: (model: { provider: string; modelId: string } | null) => void;
  /** Model/thinking picked in the composer before the session existed —
   *  applied to the spawn command so the first prompt runs with them. */
  pendingComposerModelRef: { current: { provider: string; modelId: string } | null };
  pendingThinkingLevelRef: { current: string | null };
  /** Global access-control mode (persisted user preference), read at send time
   *  so the spawn-capable requests carry the latest value. */
  accessModeRef: { current: ApprovalMode };
  /** Live composer model/thinking mirror (written by ChatInput) so enqueue can
   *  snapshot the selection onto queued items. */
  composerModelRef: { current: { provider: string; modelId: string; thinkingLevel: string } | null };
  abortControllerRef: { current: AbortController | null };
  setInputValue: (v: string) => void;
  setSearchParams: (fn: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void;
}

export interface ChatTimelineSendResult {
  steerOmpAgent: (text: string, attachments: Attachment[]) => Promise<void>;
  /** `model` re-applies a queued item's snapshot before the prompt runs
   *  (set_model / set_thinking_level RPC + prompt access mode). */
  executeSend: (
    text: string,
    attachments: Attachment[],
    options?: { model?: QueuedMessageModel | null },
  ) => Promise<void>;
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
    jumpToBottom,
    aiPlaceholderIdRef,
    adoptedSessionIdRef,
    optimisticUserIdRef,
    pendingUserDisplaysRef,
    setSessionModel,
    pendingComposerModelRef,
    pendingThinkingLevelRef,
    accessModeRef,
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

  const executeSend = useCallback(async (
    text: string,
    attachments: Attachment[],
    options?: { model?: QueuedMessageModel | null },
  ) => {
    // A queued delivery replays the snapshot the item was queued with; a plain
    // send keeps the session's live picks. 'auto' thinking leaves omp alone.
    const modelOverride = options?.model ?? null;
    const effectiveAccessMode = modelOverride?.accessMode ?? accessModeRef.current;
    const time = formatClock();
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

    const now = Date.now();
    const newUserMsg: ChatMessageData = {
      id: userMsgId,
      role: 'user',
      date: `Today, ${time}`,
      // Precise epoch anchor: the footer run-duration measures from here until
      // the last AI message. The display `date` label is minute-granular, so a
      // string fallback would inflate the measured span by up to 59s.
      startedAt: now,
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
      startedAt: now,
      content: '',
    };

    setLocalMessages(prev => {
      const next = [...prev, newUserMsg, initialAiMsg];
      persistMessages(next.filter(m => m.id !== aiPlaceholderId));
      return next;
    });

    setGenerating(true);
    setGeneratingVerb(PHASE_VERBS.thinking);
    // An explicit send is user intent to watch the answer: re-engage follow
    // mode even if the user had scrolled away, then scroll to the tail.
    setTimeout(() => jumpToBottom('smooth'), 50);

    // Real mode: route through the omp agent RPC bridge + event stream.
    if (isOmpSession) {
      aiPlaceholderIdRef.current = aiPlaceholderId;
      optimisticUserIdRef.current = userMsgId;
      // Replay the queued snapshot first so the prompt runs on the exact
      // model/thinking the item was queued with.
      if (modelOverride) {
        await ompAgent.setModel(modelOverride.provider, modelOverride.modelId);
        if (modelOverride.thinkingLevel !== 'auto') {
          await ompAgent.setThinkingLevel(modelOverride.thinkingLevel);
        }
      }
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
      const ok = await ompAgent.sendPrompt(promptText, images.length ? images : undefined, { accessMode: effectiveAccessMode });
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
        const composerModel = pendingComposerModelRef.current;
        const composerThinking = pendingThinkingLevelRef.current;
        const spawned = await ompAgent.sendNewPrompt(
          promptText,
          cwd,
          images.length ? images : undefined,
          { model: composerModel, thinkingLevel: composerThinking, accessMode: accessModeRef.current },
        );
        if (spawned) {
          adoptedSessionIdRef.current = spawned.sessionId;
          aiPlaceholderIdRef.current = aiPlaceholderId;
          if (spawned.model) setSessionModel(spawned.model);
          pendingComposerModelRef.current = null;
          pendingThinkingLevelRef.current = null;
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
          // The sidebar already re-read at prompt dispatch (sendNewPrompt
          // signals it), so the new session shows its live badge without
          // waiting for the JSONL to carry the user turn.
          return;
        }
      }
    }

    // Mock / chamber-created session: existing simulated SSE path.
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
        setGeneratingVerb,
        abortControllerRef,
        appSettings,
        scrollToBottom,
      })
    );
  }, [appSettings, folders, isOmpSession, ompAgent, selectedFolderId, sessionId, scrollToBottom, jumpToBottom, persistMessages, setSessionModel, pendingComposerModelRef, pendingThinkingLevelRef, accessModeRef]);
  return { steerOmpAgent, executeSend };
}
