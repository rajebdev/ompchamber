import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment, ChatMessageData } from '@/types';
import { useOmpAgent, type ExtensionUiDialogRequest } from '@/hooks/chat/omp';
import { useChatTimelineQueue } from '@/hooks/chat/timeline/queue';
import { useChatTimelineScroll } from '@/hooks/chat/timeline/scroll';
import { useChatTimelineActions } from '@/hooks/chat/timeline/actions';
import { useChatTimelineSend } from '@/hooks/chat/timeline/send';
import { normalizeNoticePositions } from '@/lib/chat/order';
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

  const { scrollRef, showScrollBottom, setShowScrollBottom, isScrolling, handleScroll, scrollToBottom } = useChatTimelineScroll();

  const [inputValue, setInputValue] = useSessionState<string>('chat.draft', '');
  const [inputAttachments, setInputAttachments] = useSessionState<Attachment[]>('chat.draftAttachments', []);
  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [sessionData, setSessionData] = useState<{ id?: string; title?: string; model?: string | { provider: string; modelId: string }; thinkingLevel?: string; messages?: any[] } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  // Single throat through which every generation state transition flows
  // (send, queue, steer, retry, undo, agent start/end, stream done/error).
  // Sidebar subscribes here to paint spinner/check on the session item.
  const setGenerating = (v: boolean) => {
    isGeneratingRef.current = v;
    setIsGenerating(v);
    if (sessionIdRef.current) {
      window.dispatchEvent(new CustomEvent('omp:session-processing', {
        detail: { sessionId: sessionIdRef.current, processing: v },
      }));
    }
  };
  const [generatingVerb, setGeneratingVerb] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  // Real session id adopted by a fresh spawn ("new-…" → UUID). onAgentStart
  // may fire before React re-renders with the new URL, so it reads the id
  // from here instead of the (still-stale) sessionId prop.
  const adoptedSessionIdRef = useRef<string | null>(null);
  // Fire the sidebar/metadata refresh once per session when the AI starts
  // responding (agent_start = first chunk) — the omp JSONL now carries the
  // user turn, so the sidebar item + real title appear immediately.
  const metaRefreshedRef = useRef<string | null>(null);
  // Optimistic user bubble awaiting omp's echo (reconciled by the callbacks).
  const optimisticUserIdRef = useRef<string | null>(null);

  // omp sessions are string UUIDs; chamber-created (mock/numeric) sessions are
  // integers. Only omp UUIDs route through the live agent bridge. Pending
  // client-side sessions ("new-…", created before the omp spawn) are treated
  // as not-yet-omp so executeSend spawns the real session on first send.
  const isOmpSession = Boolean(sessionId) && !String(sessionId).startsWith('new-') && Number.isNaN(Number(sessionId));
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Model seeded from the spawn response; kept until the JSONL writes model_change.
  const seededModelRef = useRef<{ provider: string; modelId: string } | null>(null);

  const applySessionData = useCallback((incoming: NonNullable<typeof sessionData>) => {
    if (incoming.model && typeof incoming.model === 'object') seededModelRef.current = incoming.model;
    const model = incoming.model ?? (isGeneratingRef.current ? seededModelRef.current ?? undefined : undefined);
    setSessionData({ ...incoming, model });
  }, []);

  /** Re-fetch the session's title/metadata after the omp JSONL has been
   *  written (spawn or agent end) so the navbar and context panel show the
   *  real session title instead of the default. Retries (fast) until the JSONL
   *  actually carries messages (omp writes the user turn on agent start), so
   *  the sidebar refresh lands as soon as the first chunk arrives. */
  const refreshSessionMeta = useCallback((sid: string) => {
    // The URL lags the adopted id right after a fresh spawn, so accept either.
    const isActive = () => sessionIdRef.current === sid || adoptedSessionIdRef.current === sid;
    if (!isActive()) return;
    let attempts = 0;
    const tryFetch = () => {
      if (!isActive()) return;
      attempts += 1;
      fetch(`/api/chat/${encodeURIComponent(sid)}`)
        .then(res => res.json())
        .then(data => {
          if (!data?.session || !isActive()) return;
          applySessionData(data.session);
          // Only signal the sidebar once the JSONL carries the user turn, so
          // the item appears with its real title (not the default).
          if ((data.session.messages?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
          } else if (attempts < 40) {
            // The omp JSONL may be written well after agent_start: keep
            // polling (20s) until the user turn lands so the sidebar item
            // appears as soon as the chunk arrives.
            setTimeout(tryFetch, 500);
          }
        })
        .catch(() => {});
    };
    tryFetch();
  }, [applySessionData]);

  const setSessionModel = useCallback((model: { provider: string; modelId: string } | null) => {
    seededModelRef.current = model;
    setSessionData(prev => ({ ...(prev ?? {}), model: model ?? undefined }));
  }, []);

  // Fetch session messages and details from API
  useEffect(() => {
    let active = true;
    // Track the previous session id so a session switch (including "New
    // Session" → new-…) clears the timeline, while the optimistic spawn
    // transition (new-… → real UUID) keeps its bubbles.
    if (sessionId !== prevSessionIdRef.current) {
      const isSpawnAdopt = sessionId && !sessionId.startsWith('new-') && prevSessionIdRef.current?.startsWith('new-');
      // Keep the optimistic bubbles while a send is in flight and this session
      // is the one it spawned (a fresh spawn may not have passed through "new-…").
      const isAdoptingInFlight = isGeneratingRef.current && adoptedSessionIdRef.current === sessionId;
      if (!isSpawnAdopt && !isAdoptingInFlight) {
        setLocalMessages([]);
        setGenerating(false);
        adoptedSessionIdRef.current = null;
        metaRefreshedRef.current = null;
        seededModelRef.current = null;
      }
      prevSessionIdRef.current = sessionId;
    }
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          if (data?.session) {
            applySessionData(data.session);
            // Only replace the timeline when the fetch actually has messages.
            // A pending "new-…" session or a just-spawned omp session whose
            // JSONL is not written yet must not wipe the optimistic bubbles.
            const fetched = data.session.messages || [];
            // Never clobber the optimistic/streaming timeline mid-run.
            if (fetched.length > 0 && !isGeneratingRef.current) {
              setLocalMessages(normalizeNoticePositions(fetched));
            } else if (!sessionId.startsWith('new-') && !isGeneratingRef.current) {
              setLocalMessages([]);
            }
          } else {
            setSessionData(null);
            if (!isGeneratingRef.current) setLocalMessages([]);
          }
        })
        .catch(err => {
          console.error('Error loading session from API:', err);
          if (active && !isGeneratingRef.current) {
            setSessionData(null);
            setLocalMessages([]);
          }
        });
    } else {
      setSessionData(null);
      setLocalMessages([]);
    }
    return () => {
      active = false;
    };
  }, [sessionId, applySessionData]);

  const persistMessages = useCallback((messagesToSave: any[]) => {
    if (!sessionId) return;
    fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesToSave }),
    }).catch(err => console.error('Error persisting messages via API:', err));
  }, [sessionId]);

  // Auto-scroll to bottom instantly when session changes
  useEffect(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom('instant' as ScrollBehavior);
        setShowScrollBottom(false);
      }, 0);
    });
  }, [sessionId, localMessages.length, scrollToBottom]);

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

  // ── Live omp agent bridge (real mode) ──────────────────────────────────────
  const aiPlaceholderIdRef = useRef<string | null>(null);
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
    setSessionModel,
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
