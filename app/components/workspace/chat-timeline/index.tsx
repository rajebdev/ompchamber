import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import { ArrowDown } from 'lucide-react';
import { ChatInput } from '@/components/workspace/chat-timeline/chat-input/index';
import { MessageList } from '@/components/workspace/chat-timeline/MessageList';
import { AskDialog } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/Lazy';
import { MinimapShortcuts } from '@/components/workspace/chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from '@/components/workspace/chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from '@/components/workspace/chat-timeline/GeneratingIndicator';
import { QueueList } from '@/components/workspace/chat-timeline/QueueList';
import { NewChatModal } from '@/components/workspace/chat-timeline/NewChatModal';
import { SubagentView } from '@/components/workspace/chat-timeline/SubagentView';
import { useChatTimeline } from '@/hooks/chat/timeline';
import { useSessionTitle } from '@/hooks/chat/timeline/session-title';
import { useSubagentView } from '@/hooks/chat/timeline/subagent-view';
import { useModelNames } from '@/hooks/models/use-model-names';
import { useProviderNames } from '@/hooks/models/use-provider-names';
import { useToasts } from '@/hooks/ui/toasts';
import { Toast } from '@/components/common/Toast';
import { normalizeNoticePositions } from '@/lib/chat/order';
import { composerRootFor } from '@/lib/workspace/active-project';

interface ChatTimelineProps {
  className?: string;
  folders?: any[];
  appSettings?: Record<string, any>;
  onSessionTitle?: (title: string | null) => void;
  /**
   * `mobile` tightens the outer padding, drops the minimap rail (no room on a
   * phone) and hands the composer a touch-sized layout. Everything else — the
   * omp agent bridge, queue, steering, subagents, ask dialogs — is identical.
   */
  variant?: 'desktop' | 'mobile';
}

export function ChatTimeline({ className = '', folders = [], appSettings = {}, onSessionTitle, variant = 'desktop' }: ChatTimelineProps) {
  const isMobile = variant === 'mobile';
  const {
    sessionId,
    selectedFolderId,
    setSelectedFolderId,
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
    extensionDialog,
    closeExtensionDialog,
    respondToExtensionUi,
  } = useChatTimeline({ folders, appSettings });
  const { toasts, pushToast, dismissToast } = useToasts();

  const [newChatInitialContent, setNewChatInitialContent] = useState<string | null>(null);
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

  const handleScrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleNewChat = useCallback((content: string) => setNewChatInitialContent(content), []);

  const modelNames = useModelNames();
  const providerNames = useProviderNames();
  const userMessages = useMemo(() => localMessages.filter(m => m.role === 'user'), [localMessages]);
  const sessionProvider = typeof sessionData?.model === 'object' ? sessionData.model.provider : undefined;
  const sessionModelName = typeof sessionData?.model === 'object'
    ? (modelNames[sessionData.model.modelId] ?? sessionData.model.modelId)
    : sessionData?.model;

  const orderedMessages = useMemo(() => normalizeNoticePositions(localMessages), [localMessages]);

  // A pending "new-…" session has no messages yet, so the workspace picker
  // must stay available until the first chat is sent (which spawns the real
  // omp session). Never lock the user into a folder before sending.
  const isPendingSession = Boolean(sessionId?.startsWith('new-'));
  const composerRoot = composerRootFor(folders, sessionId, selectedFolderId);

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
        localMessages={localMessages}
        provider={sessionProvider}
        providerNames={providerNames}
        modelName={sessionModelName}
        modelNames={modelNames}
        onThinkingLevelChange={handleThinkingLevelChange}
        onModelChange={handleModelChange}
        accessMode={accessMode}
        onAccessModeChange={handleAccessModeChange}
        composerModelRef={composerModelRef}
        sessionModel={typeof sessionData?.model === 'object' ? sessionData.model : null}
        sessionThinkingLevel={sessionData?.thinkingLevel}
        generatingVerb={generatingVerb}
        variant={variant}
      />
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-hidden bg-canvas relative ${className}`}>
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
          <>
            {/* Minimap Shortcuts — desktop only: the rail needs side room a
                phone does not have. */}
            {!isMobile && (
              <MinimapShortcuts userMessages={userMessages} onScrollTo={handleScrollTo} />
            )}

            {/* Timeline Body */}
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className={`flex-1 scrollbar-overlay-container overscroll-contain scroll-smooth overflow-x-hidden ${
                isMobile ? 'px-3 py-3 pb-8' : 'p-4 pb-10'
              } ${
                isScrolling ? 'timeline-scrollbar-visible' : 'timeline-scrollbar-hidden'
              }`}
            >
              <div ref={contentRef} className="mx-auto w-full max-w-[970px]">
                <MessageList
                  messages={orderedMessages}
                  isGenerating={isGenerating}
                  provider={sessionProvider}
                  providerNames={providerNames}
                  modelName={sessionModelName}
                  modelNames={modelNames}
                  onUndo={handleUndo}
                  onRetry={handleRetry}
                  onNewChat={handleNewChat}
                />
              </div>
            </div>

            {/* Scroll to bottom button */}
            {showScrollBottom && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                <button
                  onClick={() => jumpToBottom('smooth')}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-ink/20 bg-paper text-ink/60 hover:text-ink hover:bg-ink/5 transition-all shadow-sm"
                  title="Scroll to bottom"
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Input Area Footer with Docked Generating Indicator (Seamless & Transparent) */}
      {!activeSubagent && (
        <div
          className={`bg-transparent border-t-0 flex-shrink-0 space-y-2 ${isMobile ? 'px-3 pt-1' : 'p-4 pt-1'}`}
          style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' } : undefined}
        >
          <div className="mx-auto w-full max-w-[970px]">
            {isGenerating && (
              <GeneratingIndicator 
                modelName={sessionModelName} 
                generatingVerb={generatingVerb} 
              />
            )}
            <QueueList 
              queue={messageQueue} 
              setQueue={setMessageQueue} 
              onEdit={handleEditQueueItem} 
              onSendNow={handleSendNowQueueItem}
            />
            <QueueList
              queue={steeringQueue}
              setQueue={setSteeringQueue}
              isSteering
            />
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              rootPath={composerRoot}
              attachments={inputAttachments}
              onAttachmentsChange={setInputAttachments}
              onSend={handleSend}
              isGenerating={isGenerating}
              onStop={handleStop}
              appSettings={appSettings}
              onThinkingLevelChange={handleThinkingLevelChange}
              onModelChange={handleModelChange}
              accessMode={accessMode}
              onAccessModeChange={handleAccessModeChange}
              composerModelRef={composerModelRef}
              sessionModel={typeof sessionData?.model === 'object' ? sessionData.model : null}
              sessionThinkingLevel={sessionData?.thinkingLevel}
              variant={variant}
            />
          </div>
        </div>
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

      {extensionDialog && (
        <AskDialog
          request={extensionDialog}
          onRespond={(request, response) => {
            void respondToExtensionUi(request, response);
            closeExtensionDialog();
          }}
        />
      )}

      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
