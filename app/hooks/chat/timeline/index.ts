import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment, ChatMessageData } from '@/types';
import { useOmpAgent, type ExtensionUiDialogRequest } from '@/hooks/chat/omp';
import { useChatTimelineQueue } from '@/hooks/chat/timeline/queue';
import { useChatTimelineScroll } from '@/hooks/chat/timeline/scroll';
import { useChatTimelineActions } from '@/hooks/chat/timeline/actions';
import { useChatTimelineSend } from '@/hooks/chat/timeline/send';
import { useSessionLoad } from '@/hooks/chat/timeline/session-load';
import { useBrowserPageContextInsert } from '@/hooks/chat/timeline/browser-context';
import { createOmpAgentCallbacks } from '@/lib/chat/timeline/omp-callbacks';
import { useSessionState } from '@/hooks/workspace/session-state';

interface UseChatTimelineOptions {
  folders?: any[];
  appSettings?: Record<string, any>;
}

export function useChatTimeline({ folders = [], appSettings = {} }: UseChatTimelineOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const folderId = searchParams.get('folderId');

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedFolderId(folderId ? parseInt(folderId, 10) : null);
  }, [folderId]);

  // Choosing a workspace context mirrors it to the `folderId` URL param so the
  // layout (right-panel scoping) can react to the same selection.
  const selectContextFolder = useCallback((id: number | null) => {
    setSelectedFolderId(id);
    setSearchParams(prev => {
      if (id) prev.set('folderId', String(id));
      else prev.delete('folderId');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const { scrollRef, showScrollBottom, isScrolling, handleScroll, scrollToBottom } = useChatTimelineScroll();

  const [inputValue, setInputValue] = useSessionState<string>('chat.draft', '');
  useBrowserPageContextInsert(setInputValue);
  const [inputAttachments, setInputAttachments] = useSessionState<Attachment[]>('chat.draftAttachments', []);
  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [generatingVerb, setGeneratingVerb] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Single throat through which every generation state transition flows
  // (send, queue, steer, retry, undo, agent start/end, stream done/error).
  // Sidebar subscribes here to paint spinner/check on the session item.
  //
  // Stable identity is load-bearing: this is a dependency of the session-load
  // effect, which re-fetches history and replaces the timeline. A fresh
  // function per render made that effect re-run every render, and its
  // setLocalMessages(fetched) then re-rendered again — an unbounded fetch loop.
  const setGenerating = useCallback((v: boolean) => {
    isGeneratingRef.current = v;
    setIsGenerating(v);
    if (sessionIdRef.current) {
      window.dispatchEvent(new CustomEvent('omp:session-processing', {
        detail: { sessionId: sessionIdRef.current, processing: v },
      }));
    }
  }, []);
  // Fire the sidebar/metadata refresh once per session when the AI starts
  // responding (agent_start = first chunk) — the omp JSONL now carries the
  // user turn, so the sidebar item + real title appear immediately.
  const metaRefreshedRef = useRef<string | null>(null);
  // Optimistic user bubble awaiting omp's echo (reconciled by the callbacks).
  const optimisticUserIdRef = useRef<string | null>(null);
  // Raw composer text for steer/follow-up echoes (those paths have no bubble).
  const pendingUserDisplaysRef = useRef<{ sent: string; display: string }[]>([]);

  // omp sessions are string UUIDs; chamber-created (mock/numeric) sessions are
  // integers. Only omp UUIDs route through the live agent bridge. Pending
  // client-side sessions ("new-…", created before the omp spawn) are treated
  // as not-yet-omp so executeSend spawns the real session on first send.
  const isOmpSession = Boolean(sessionId) && !String(sessionId).startsWith('new-') && Number.isNaN(Number(sessionId));

  const aiPlaceholderIdRef = useRef<string | null>(null);

  const {
    sessionData,
    adoptedSessionIdRef,
    refreshSessionMeta,
    setSessionModel,
  } = useSessionLoad({
    sessionId,
    setLocalMessages,
    setGenerating,
    aiPlaceholderIdRef,
    metaRefreshedRef,
  });

  // Composer picks made BEFORE the omp session exists (pending "new-…" view):
  // there is no live session to receive the RPC yet, so the selection is held
  // here and applied to the spawn command on first send.
  const pendingComposerModelRef = useRef<{ provider: string; modelId: string } | null>(null);
  const pendingThinkingLevelRef = useRef<string | null>(null);

  const persistMessages = useCallback((messagesToSave: any[]) => {
    if (!sessionId) return;
    fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesToSave }),
    }).catch(err => console.error('Error persisting messages via API:', err));
  }, [sessionId]);

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions?.find((s: any) => String(s.id) === String(sessionId));
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const {
    messageQueue,
    setMessageQueue,
    steeringQueue,
    setSteeringQueue,
    removeDeliveredFromQueue,
  } = useChatTimelineQueue(sessionId, currentSession);
  const [extensionDialog, setExtensionDialog] = useState<ExtensionUiDialogRequest | null>(null);

  const ompAgent = useOmpAgent(isOmpSession ? sessionId : null, createOmpAgentCallbacks({
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
    pendingUserDisplaysRef,
    persistMessages,
    abortControllerRef,
    appSettings,
    setExtensionDialog,
  }));
  const { prepareDeliverable, steerOmpAgent, executeSend } = useChatTimelineSend({
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
    pendingComposerModelRef,
    pendingThinkingLevelRef,
    abortControllerRef,
    setInputValue,
    setSearchParams,
  });

  // Auto-process queue: follow-ups queued by the mock/chamber path deliver
  // when the run ends. omp sessions need no client delivery — omp runs the
  // queued follow-up natively and its user message_end removes the mirror.
  useEffect(() => {
    if (!isOmpSession && !isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSend(nextMessage.text, nextMessage.attachments);
    }
  }, [isOmpSession, isGenerating, messageQueue, executeSend, setMessageQueue]);

  const {
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
  } = useChatTimelineActions({
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
    pendingComposerModelRef,
    pendingThinkingLevelRef,
    setSearchParams,
    setExtensionDialog,
  });

  return {
    sessionId,
    folderId,
    isOmpSession,
    selectedFolderId,
    setSelectedFolderId: selectContextFolder,
    sessionData,
    localMessages,
    isGenerating,
    generatingVerb,
    messageQueue,
    setMessageQueue,
    steeringQueue,
    setSteeringQueue,
    inputValue,
    setInputValue,
    inputAttachments,
    setInputAttachments,
    scrollRef,
    showScrollBottom,
    isScrolling,
    handleScroll,
    scrollToBottom,
    handleSend,
    handleEditQueueItem,
    handleSendNowQueueItem,
    handleUndo,
    handleRetry,
    submitNewChat,
    stopGenerating,
    handleThinkingLevelChange,
    handleModelChange,
    extensionDialog,
    closeExtensionDialog,
    respondToExtensionUi: ompAgent.respondToExtensionUi,
  };
}
