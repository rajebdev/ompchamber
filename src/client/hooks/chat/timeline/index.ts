import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import type { Attachment, ChatMessageData } from '@/shared/types';
import { useOmpAgent } from '@/client/hooks/chat/omp';
import { useChatTimelineQueue } from '@/client/hooks/chat/timeline/queue';
import { useExtensionDialogQueue } from '@/client/hooks/chat/timeline/extension-dialog';
import { useChatTimelineScroll } from '@/client/hooks/chat/timeline/scroll';
import { useTimelineAutoScroll } from '@/client/hooks/chat/timeline/auto-scroll';
import { useChatTimelineActions } from '@/client/hooks/chat/timeline/actions';
import { useChatTimelineSend } from '@/client/hooks/chat/timeline/send';
import type { ComposerModelPick } from '@/client/hooks/chat/timeline/deferred-model';
import { useSessionLoad } from '@/client/hooks/chat/timeline/session-load';
import { useUserTurns } from '@/client/hooks/chat/timeline/user-turns';
import { useBrowserPageContextInsert } from '@/client/hooks/chat/timeline/browser-context';
import { createOmpAgentCallbacks } from '@/shared/lib/chat/timeline/omp-callbacks';
import { cancelStreamingCoalescer } from '@/shared/lib/chat/timeline/stream-coalescer';
import { readStreamTransport } from '@/shared/lib/chat/omp/transport';
import { ACCESS_MODE_SETTING_KEY, normalizeApprovalMode } from '@/shared/lib/omp/config/access-mode';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { writeSetting } from '@/shared/lib/settings/client';

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

  // Ref mirror of loadOlder so the scroll handler can call the latest one
  // without re-creating it (useSessionLoad is defined below the scroll hook).
  const loadOlderRef = useRef<() => void>(() => {});

  const { scrollRef, contentRef, showScrollBottom, isScrolling, handleScroll, scrollToBottom, jumpToBottom } = useChatTimelineScroll({
    onScrollTop: () => loadOlderRef.current(),
  });

  const [inputValue, setInputValue] = useSessionState<string>('chat.draft', '');
  useBrowserPageContextInsert(setInputValue);
  const [inputAttachments, setInputAttachments] = useSessionState<Attachment[]>('chat.draftAttachments', []);
  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);

  // A pending "new-…" session renders the workspace picker, which owns its own
  // timeline and scroll handling.
  const isPendingSession = Boolean(sessionId?.startsWith('new-'));
  // Committed history lands asynchronously (session-load.ts), so the container
  // paints at the top first; jump to the tail once per session when it does.
  useTimelineAutoScroll({
    sessionId,
    messages: localMessages,
    scrollRef,
    scrollToBottom,
    enabled: !isPendingSession,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  // Mirror of localMessages for non-reactive reads (session-load merge path).
  const localMessagesRef = useRef<ChatMessageData[]>([]);
  localMessagesRef.current = localMessages;
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
  }, []);
  // Set when the user presses Stop; the queue auto-process effect holds off
  // while this is armed so a stopped run does NOT trigger the next queued
  // item (stop-all semantics). Disarmed by any explicit send.
  const stopHoldRef = useRef(false);
  // Fire the sidebar/metadata refresh once per session when the AI starts
  // responding (agent_start = first chunk) — the omp JSONL now carries the
  // user turn, so the sidebar item + real title appear immediately.
  const metaRefreshedRef = useRef<string | null>(null);
  // Per-run guard for the "first assistant answer landed" sidebar signal
  // (omp-callbacks onMessageEnd): the sidebar refreshes once per run on the
  // completed first assistant turn, not on every assistant segment.
  const firstAssistantRef = useRef(false);
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
    adoptedSessionIdRef, refreshSessionMeta, seedSession,
    hasMore,
    loadingOlder, loadOlderError, sessionLoading, loadOlder, jumpToTurn,
  } = useSessionLoad({
    sessionId,
    setLocalMessages,
    setGenerating,
    isGeneratingRef,
    aiPlaceholderIdRef,
    localMessagesRef,
    optimisticUserIdRef,
    cancelStreamingCoalescer,
    metaRefreshedRef,
    scrollRef,
  });
  loadOlderRef.current = loadOlder;

  // Jump rail: the full-history turn index (the mounted window is only a page
  // of a long session) plus the paging walk that reaches a turn outside it.
  const { turns: userTurns, jumping: jumpingTurn, jumpToTurn: jumpToUserTurn } = useUserTurns({
    sessionId,
    messages: localMessages,
    jumpToTurn,
  });

  // Composer picks made BEFORE the omp session exists (pending "new-…" view):
  // there is no live session to receive the RPC yet, so the selection is held
  // here and applied to the spawn command on first send.
  const pendingComposerModelRef = useRef<{ provider: string; modelId: string } | null>(null);
  const pendingThinkingLevelRef = useRef<string | null>(null);
  // Live mirror of the composer's model/thinking pick: the enqueue path
  // snapshots it onto queued items so auto-delivery replays those settings.
  const composerModelRef = useRef<{ provider: string; modelId: string; thinkingLevel: string } | null>(null);
  // Picks made WHILE a turn streams: held here so they cannot re-target the
  // answer in flight (omp applies set_model to the running turn), and pushed
  // onto the session right before the next prompt.
  const deferredComposerPickRef = useRef<ComposerModelPick | null>(null);
  // A stashed pick belongs to ONE session's next prompt: carrying it across a
  // switch would silently re-target the session the user just opened.
  useEffect(() => {
    deferredComposerPickRef.current = null;
  }, [sessionId]);

  // Access-control mode is a global, persisted user preference (unlike the
  // per-session model/thinking picks): it hydrates from appSettings at first
  // paint and is mirrored into a ref so the send path reads the latest value
  // without re-creating executeSend.
  const [accessMode, setAccessMode] = useState<ApprovalMode>(() => normalizeApprovalMode(appSettings.omp_access_mode));
  const accessModeRef = useRef<ApprovalMode>(accessMode);
  accessModeRef.current = accessMode;

  const handleAccessModeChange = useCallback((mode: ApprovalMode) => {
    setAccessMode(mode);
    accessModeRef.current = mode;
    // Persist the last selection; the server reads this key as the spawn-time
    // default. Fire-and-forget: the in-memory value is already authoritative
    // for this session's requests, which carry it explicitly.
    writeSetting(ACCESS_MODE_SETTING_KEY, mode);
  }, []);

  const persistMessages = useCallback((messagesToSave: any[]) => {
    if (!sessionId) return;
    fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesToSave }),
    }).catch(err => console.error('Error persisting messages via API:', err));
  }, [sessionId]);

  const {
    messageQueue,
    enqueueMessage,
    removeMessage,
    reorderMessages,
    steeringQueue,
    setSteeringQueue,
  } = useChatTimelineQueue(sessionId);
  const {
    pending: extensionDialogs,
    enqueue: enqueueExtensionDialog,
    resolve: resolveExtensionDialog,
    withdraw: withdrawExtensionDialog,
  } = useExtensionDialogQueue(sessionId);

  const ompAgent = useOmpAgent(isOmpSession ? sessionId : null, createOmpAgentCallbacks({
    setGenerating,
    setGeneratingVerb,
    scrollToBottom,
    adoptedSessionIdRef,
    sessionIdRef,
    metaRefreshedRef,
    firstAssistantRef,
    refreshSessionMeta,
    setLocalMessages,
    aiPlaceholderIdRef,
    optimisticUserIdRef,
    pendingUserDisplaysRef,
    persistMessages,
    abortControllerRef,
    appSettings,
    enqueueExtensionDialog,
    withdrawExtensionDialog,
  }), readStreamTransport(appSettings));
  const { steerOmpAgent, executeSend } = useChatTimelineSend({
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
    seedSession,
    pendingComposerModelRef,
    pendingThinkingLevelRef,
    deferredComposerPickRef,
    accessModeRef,
    abortControllerRef,
    setInputValue,
    setSearchParams,
  });

  // Queue auto-delivery moved server-side: the wrapper's terminal `agent_end`
  // schedules the next queued prompt (`lib/queue/delivery.server.ts`), with a
  // transactional head claim so no reload/tab race can double-send or wipe the
  // table. The client panel is a view; the mount nudge lives in the queue
  // hook. `stopHoldRef` remains only for the mock path below.

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
  } = useChatTimelineActions({
    inputValue,
    setInputValue,
    setInputAttachments,
    isGenerating,
    isOmpSession,
    sessionId,
    appSettings,
    messageQueue,
    enqueueMessage,
    removeMessage,
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
    deferredComposerPickRef,
    accessModeRef,
    setSearchParams,
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
    hasMore,
    loadingOlder,
    loadOlderError,
    sessionLoading,
    loadOlder,
    userTurns,
    jumpingTurn,
    jumpToUserTurn,
    generatingVerb,
    messageQueue,
    removeMessage,
    reorderMessages,
    steeringQueue,
    setSteeringQueue,
    inputValue,
    setInputValue,
    inputAttachments,
    setInputAttachments,
    scrollRef,
    contentRef,
    showScrollBottom,
    isScrolling,
    handleScroll,
    scrollToBottom,
    jumpToBottom,
    handleSend,
    handleEditQueueItem,
    handleSendNowQueueItem,
    handleUndo,
    handleRetry,
    submitNewChat,
    stopGenerating,
    handleThinkingLevelChange,
    handleModelChange,
    accessMode,
    handleAccessModeChange,
    composerModelRef,
    deferredComposerPickRef,
    extensionDialogs,
    resolveExtensionDialog,
    respondToExtensionUi: ompAgent.respondToExtensionUi,
  };
}
