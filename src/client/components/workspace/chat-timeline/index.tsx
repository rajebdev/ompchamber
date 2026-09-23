import { useCallback, useMemo, useState } from 'preact/hooks';
import { useSearchParams } from '@/client/lib/router/search-params';
import { ExtensionDialog } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/Lazy';
import { AskFramesContext, splitAskFrames, type AskFramesHandle } from '@/client/hooks/chat/timeline/ask-frames';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';
import type { UserTurnRef } from '@/shared/types/chat';
import type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/Lazy';
import { EmptyWorkspacePrompt } from '@/client/components/workspace/chat-timeline/EmptyWorkspacePrompt';
import { SessionSkeleton } from '@/client/components/workspace/chat-timeline/SessionSkeleton';
import { UndoConfirmModal } from '@/client/components/workspace/chat-timeline/UndoConfirmModal';
import { NewChatModal } from '@/client/components/workspace/chat-timeline/NewChatModal';
import { SubagentView } from '@/client/components/workspace/chat-timeline/SubagentView';
import { TimelineBody } from '@/client/components/workspace/chat-timeline/TimelineBody';
import { ComposerDock } from '@/client/components/workspace/chat-timeline/ComposerDock';
import { useChatTimeline } from '@/client/hooks/chat/timeline';
import { useSessionTitle } from '@/client/hooks/chat/timeline/session-title';
import { useSubagentView } from '@/client/hooks/chat/timeline/subagent-view';
import { useUndoConfirmation } from '@/client/hooks/chat/timeline/undo-confirmation';
import { useModelNames } from '@/client/hooks/models/use-model-names';
import { useProviderNames } from '@/client/hooks/models/use-provider-names';
import { useToasts } from '@/client/hooks/ui/toasts';
import { ToastStack } from '@/client/components/common/ToastStack';
import { composerRootFor } from '@/shared/lib/workspace/active-project';
import { useSidebarData } from '@/client/hooks/chat/omp/session-list';

interface ChatTimelineProps {
  className?: string;
  appSettings?: Record<string, any>;
  onSessionTitle?: (title: string | null) => void;
  /**
   * `mobile` tightens the outer padding, drops the minimap rail (no room on a
   * phone) and hands the composer a touch-sized layout. Everything else — the
   * omp agent bridge, queue, steering, subagents, ask dialogs — is identical.
   */
  variant?: 'desktop' | 'mobile';
}

export function ChatTimeline({ className = '', appSettings = {}, onSessionTitle, variant = 'desktop' }: ChatTimelineProps) {
  const { folders } = useSidebarData();
  const isMobile = variant === 'mobile';
  const {
    sessionId,
    selectedFolderId,
    setSelectedFolderId,
    sessionData,
    localMessages,
    isGenerating,
    hasMore,
    loadingOlder, loadOlderError, sessionLoading,
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
    respondToExtensionUi,
  } = useChatTimeline({ folders, appSettings });
  const { toasts, pushToast, dismissToast } = useToasts();

  // Ask dialogs render on their own tool card; anything else omp is blocked on
  // (an approval gate, an extension picker) has no card and keeps the modal.
  const { framesByTool, modalRequest } = useMemo(
    () => splitAskFrames(localMessages, extensionDialogs),
    [localMessages, extensionDialogs],
  );
  const respondToFrame = useCallback((request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => {
    void respondToExtensionUi(request, response);
    resolveExtensionDialog(request.id);
  }, [respondToExtensionUi, resolveExtensionDialog]);
  const askFrames = useMemo<AskFramesHandle>(
    () => ({ framesByTool, respond: respondToFrame }),
    [framesByTool, respondToFrame],
  );

  const [newChatInitialContent, setNewChatInitialContent] = useState<string | null>(null);
  const { pendingUndo, undoing, requestUndo: handleRequestUndo, closeUndoConfirm, confirmUndo } = useUndoConfirmation(handleUndo);
  const [searchParams, setSearchParams] = useSearchParams();

  // Stop-all semantics: the run stops AND the queued follow-ups stay in the
  // panel (the auto-process holds off). Surface what just happened and how to
  // proceed — the toast action delivers the head item immediately.
  const handleStop = useCallback(() => {
    const heldCount = stopGenerating();
    if (heldCount === 0) return;
    pushToast(
      `Stopped. ${heldCount} message${heldCount > 1 ? 's' : ''} still queued — nothing was sent.`,
      'success',
      {
        action: { label: 'Send now', onClick: () => {
          const first = messageQueue[0];
          if (first) void handleSendNowQueueItem(first);
        } },
        duration: 8000,
      },
    );
  }, [stopGenerating, pushToast, messageQueue, handleSendNowQueueItem]);
  const { activeSubagent, back: handleSubagentBack } = useSubagentView(
    sessionId,
    searchParams.get('subagent'),
    setSearchParams,
  );

  useSessionTitle(sessionId, sessionData?.title, onSessionTitle);

  const handleJumpTurn = useCallback((turn: UserTurnRef) => {
    void jumpToUserTurn(turn.id, turn.index);
  }, [jumpToUserTurn]);

  const handleNewChat = useCallback((content: string) => setNewChatInitialContent(content), []);

  const modelNames = useModelNames();
  const providerNames = useProviderNames();
  const sessionProvider = typeof sessionData?.model === 'object' ? sessionData.model.provider : undefined;
  const sessionModelName = typeof sessionData?.model === 'object'
    ? (modelNames[sessionData.model.modelId] ?? sessionData.model.modelId)
    : sessionData?.model;

  // A pending "new-…" session has no messages yet, so the workspace picker
  // must stay available until the first chat is sent (which spawns the real
  // omp session). Never lock the user into a folder before sending.
  const isPendingSession = Boolean(sessionId?.startsWith('new-'));
  const composerRoot = composerRootFor(folders, sessionId, selectedFolderId);

  // Full-panel skeleton while a session's committed history is still loading:
  // covers the whole chat timeline (body + composer) so a session switch shows
  // one coherent placeholder instead of a half-drawn view. Skipped while an
  // optimistic send owns the tail (fresh spawn adoption must keep its bubbles).
  const showFullSkeleton = !isPendingSession && sessionLoading && localMessages.length === 0;

  if (!sessionId || isPendingSession) {
    return (
      <EmptyWorkspacePrompt
        className={className}
        folders={folders}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={setSelectedFolderId}
        rootPath={composerRoot}
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputAttachments={inputAttachments}
        setInputAttachments={setInputAttachments}
        onSend={handleSend}
        isGenerating={isGenerating}
        appSettings={appSettings}
        messages={localMessages}
        provider={sessionProvider}
        providerNames={providerNames}
        modelName={sessionModelName}
        modelNames={modelNames}
        onThinkingLevelChange={handleThinkingLevelChange}
        onModelChange={handleModelChange}
        accessMode={accessMode}
        onAccessModeChange={handleAccessModeChange}
        composerModelRef={composerModelRef}
        deferredComposerPickRef={deferredComposerPickRef}
        sessionModel={typeof sessionData?.model === 'object' ? sessionData.model : null}
        sessionThinkingLevel={sessionData?.thinkingLevel}
        generatingVerb={generatingVerb}
        variant={variant}
      />
    );
  }

  return (
    <AskFramesContext.Provider value={askFrames}>
      <div className={`flex flex-col h-full min-h-0 overflow-hidden bg-canvas relative ${className}`}>
        {showFullSkeleton ? (
          <SessionSkeleton />
        ) : (
          <>
            {/* Main chat container wrapper */}
            <div className="relative flex-1 min-h-0 flex flex-col">
              {activeSubagent ? (
                <SubagentView
                  sessionId={sessionId}
                  subagent={activeSubagent}
                  onBack={handleSubagentBack}
                  provider={sessionProvider}
                  providerNames={providerNames}
                />
              ) : (
                <TimelineBody
                  isMobile={isMobile}
                  userTurns={userTurns}
                  jumpingTurn={jumpingTurn}
                  onJumpTurn={handleJumpTurn}
                  scrollRef={scrollRef}
                  contentRef={contentRef}
                  handleScroll={handleScroll}
                  isScrolling={isScrolling}
                  loadingOlder={loadingOlder}
                  hasMore={hasMore}
                  loadOlderError={loadOlderError}
                  loadOlder={loadOlder}
                  messages={localMessages}
                  isGenerating={isGenerating}
                  provider={sessionProvider}
                  providerNames={providerNames}
                  modelName={sessionModelName}
                  modelNames={modelNames}
                  thinkingLevel={sessionData?.thinkingLevel}
                  onUndo={handleRequestUndo}
                  onRetry={handleRetry}
                  onNewChat={handleNewChat}
                  showScrollBottom={showScrollBottom}
                  jumpToBottom={jumpToBottom}
                />
              )}
            </div>

            {/* Input Area Footer with Docked Generating Indicator (Seamless & Transparent) */}
            {!activeSubagent && (
              <ComposerDock
                isMobile={isMobile}
                sessionId={sessionId}
                isGenerating={isGenerating}
                modelName={sessionModelName}
                generatingVerb={generatingVerb}
                provider={sessionProvider}
                providerNames={providerNames}
                messageQueue={messageQueue}
                onRemoveQueueItem={removeMessage}
                onReorderQueue={reorderMessages}
                onEditQueueItem={handleEditQueueItem}
                onSendNowQueueItem={handleSendNowQueueItem}
                steeringQueue={steeringQueue}
                setSteeringQueue={setSteeringQueue}
                inputValue={inputValue}
                setInputValue={setInputValue}
                rootPath={composerRoot}
                attachments={inputAttachments}
                setAttachments={setInputAttachments}
                onSend={handleSend}
                onStop={handleStop}
                appSettings={appSettings}
                onThinkingLevelChange={handleThinkingLevelChange}
                onModelChange={handleModelChange}
                accessMode={accessMode}
                onAccessModeChange={handleAccessModeChange}
                composerModelRef={composerModelRef}
                deferredComposerPickRef={deferredComposerPickRef}
                sessionModel={typeof sessionData?.model === 'object' ? sessionData.model : null}
                sessionThinkingLevel={sessionData?.thinkingLevel}
                variant={variant}
              />
            )}
          </>
        )}

        {pendingUndo && (
          <UndoConfirmModal
            isOmpSession={Boolean(sessionId) && !sessionId.startsWith('new-') && Number.isNaN(Number(sessionId))}
            content={pendingUndo.content}
            undoing={undoing}
            onClose={closeUndoConfirm}
            onConfirm={confirmUndo}
          />
        )}
        {newChatInitialContent !== null && (
          <NewChatModal
            initialContent={newChatInitialContent}
            onClose={() => setNewChatInitialContent(null)}
            onSend={submitNewChat}
            appSettings={appSettings}
            accessMode={accessMode}
            onAccessModeChange={handleAccessModeChange}
            composerModelRef={composerModelRef}
          />
        )}

        {modalRequest && (
          <ExtensionDialog request={modalRequest} onRespond={respondToFrame} />
        )}

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AskFramesContext.Provider>
  );
}
