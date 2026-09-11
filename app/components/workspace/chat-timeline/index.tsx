import { useState, useEffect, useMemo } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatInput } from '@/components/workspace/chat-timeline/chat-input/index';
import { ChatMessageItem } from '@/components/workspace/chat-timeline/MessageItem';
import { AskDialog } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog';
import { MinimapShortcuts } from '@/components/workspace/chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from '@/components/workspace/chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from '@/components/workspace/chat-timeline/GeneratingIndicator';
import { QueueList } from '@/components/workspace/chat-timeline/QueueList';
import { NewChatModal } from '@/components/workspace/chat-timeline/NewChatModal';
import { SubagentView } from '@/components/workspace/chat-timeline/SubagentView';
import { useChatTimeline } from '@/hooks/chat/timeline';
import { responseRunDurationMs } from '@/lib/chat/duration';
import { normalizeNoticePositions } from '@/lib/chat/order';

import type { ExtensionUiDialogRequest } from '@/hooks/chat/omp';
import type { SubagentInfo } from '@/types';

interface ChatTimelineProps {
  className?: string;
  folders?: any[];
  appSettings?: Record<string, any>;
  onSessionTitle?: (title: string | null) => void;
}

export function ChatTimeline({ className = '', folders = [], appSettings = {}, onSessionTitle }: ChatTimelineProps) {
  const {
    sessionId,
    isOmpSession,
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
    respondToExtensionUi,
  } = useChatTimeline({ folders, appSettings });

  const [newChatInitialContent, setNewChatInitialContent] = useState<string | null>(null);
  const [previewDialog, setPreviewDialog] = useState<ExtensionUiDialogRequest | null>(null);
  const [activeSubagent, setActiveSubagent] = useState<SubagentInfo | null>(null);

  // Subagent transcripts are opened from outside (the sidebar roster item
  // dispatches omp:view-subagent). Only accept the frame for the active
  // session so a stale click cannot hijack another session's timeline.
  useEffect(() => {
    const handleViewSubagent = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string; subagent?: SubagentInfo }>).detail;
      if (!detail?.subagent) return;
      if (!sessionId || detail.sessionId !== sessionId) return;
      setActiveSubagent(detail.subagent);
    };
    window.addEventListener('omp:view-subagent', handleViewSubagent);
    return () => window.removeEventListener('omp:view-subagent', handleViewSubagent);
  }, [sessionId]);

  // Switching sessions drops back to the main timeline.
  useEffect(() => {
    setActiveSubagent(null);
  }, [sessionId]);

  useEffect(() => {
    const handleOpenAsk = (e: Event) => {
      const customEvent = e as CustomEvent<ExtensionUiDialogRequest>;
      if (customEvent.detail) {
        setPreviewDialog(customEvent.detail);
      }
    };
    window.addEventListener('omp:open_ask_dialog', handleOpenAsk);
    return () => window.removeEventListener('omp:open_ask_dialog', handleOpenAsk);
  }, []);

  useEffect(() => {
    // Pending client-side sessions ("new-…") show a default title until the
    // real omp session metadata arrives.
    const pending = sessionId?.startsWith('new-') ? 'Untitled session' : null;
    onSessionTitle?.(pending ?? sessionData?.title ?? null);
  }, [sessionId, sessionData?.title, onSessionTitle]);

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const userMessages = localMessages.filter(m => m.role === 'user');
  const sessionModelName = typeof sessionData?.model === 'object'
    ? sessionData.model.modelId
    : sessionData?.model;

  const orderedMessages = useMemo(() => normalizeNoticePositions(localMessages), [localMessages]);

  // A pending "new-…" session has no messages yet, so the workspace picker
  // must stay available until the first chat is sent (which spawns the real
  // omp session). Never lock the user into a folder before sending.
  const isPendingSession = Boolean(sessionId?.startsWith('new-'));

  if (!sessionId || isPendingSession) {
    return (
      <EmptyWorkspacePrompt
        className={className}
        folders={folders}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={setSelectedFolderId}
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputAttachments={inputAttachments}
        setInputAttachments={setInputAttachments}
        onSend={handleSend}
        isGenerating={isGenerating}
        appSettings={appSettings}
        localMessages={localMessages}
        modelName={sessionModelName}
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
            onBack={() => setActiveSubagent(null)}
          />
        ) : (
          <>
            {/* Minimap Shortcuts */}
            <MinimapShortcuts 
              userMessages={userMessages} 
              onScrollTo={handleScrollTo} 
            />

            {/* Timeline Body */}
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className={`flex-1 scrollbar-overlay-container overscroll-contain p-4 scroll-smooth overflow-x-hidden pb-10 ${
                isScrolling ? 'timeline-scrollbar-visible' : 'timeline-scrollbar-hidden'
              }`}
            >
              <div className="mx-auto w-full max-w-[970px]">
                {orderedMessages.map((msg, idx) => {
                  const prev = orderedMessages[idx - 1];
                  // The streaming AI message is the last non-notice row: notice
                  // rows sit above the turn, so a plain "last item" check would
                  // mark the notice as streaming and render the footer early.
                  let lastAiIdx = orderedMessages.length - 1;
                  while (lastAiIdx >= 0 && orderedMessages[lastAiIdx].notice) lastAiIdx--;
                  const isLoading = isGenerating && idx === lastAiIdx && msg.role === 'ai';
                  // Notice rows are transparent for footer purposes: the last real
                  // AI message of a run still owns the footer even when a notice
                  // row follows it.
                  const nextReal = orderedMessages.slice(idx + 1).find(m => !m.notice);
                  const isLastAi = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
                  const isPrevNotice = Boolean(prev?.notice);
                  const isAiFragment = msg.role !== 'user' && prev && prev.role !== 'user' && !isPrevNotice;
                  let prevRealIdx = idx - 1;
                  while (prevRealIdx >= 0 && orderedMessages[prevRealIdx].notice) prevRealIdx--;
                  const prevReal = prevRealIdx >= 0 ? orderedMessages[prevRealIdx] : null;
                  const isPrevAssistant = Boolean(msg.role !== 'user' && prevReal && prevReal.role !== 'user');
                  return (
                    <ChatMessageItem
                      key={msg.id}
                      msg={msg}
                      modelName={sessionModelName}
                      isStreaming={isLoading}
                      onUndo={handleUndo}
                      onRetry={handleRetry}
                      onNewChat={(content) => setNewChatInitialContent(content)}
                      footerVisible={isLastAi}
                      durationMs={isLastAi ? responseRunDurationMs(orderedMessages, idx) : null}
                      isPrevAssistant={isPrevAssistant}
                      className={msg.notice ? 'mt-3 mb-1' : isAiFragment ? 'mt-1' : 'mt-3'}
                    />
                  );
                })}
              </div>
            </div>

            {/* Scroll to bottom button */}
            {showScrollBottom && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                <button 
                  onClick={() => scrollToBottom('smooth')}
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
        <div className="p-4 pt-1 bg-transparent border-t-0 flex-shrink-0 space-y-2">
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
              attachments={inputAttachments}
              onAttachmentsChange={setInputAttachments}
              onSend={handleSend}
              isGenerating={isGenerating}
              onStop={stopGenerating}
              appSettings={appSettings}
              sessionId={sessionId}
              isOmpSession={isOmpSession}
              onThinkingLevelChange={handleThinkingLevelChange}
              onModelChange={handleModelChange}
              sessionModel={typeof sessionData?.model === 'object' ? sessionData.model : null}
              sessionThinkingLevel={sessionData?.thinkingLevel}
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
        />
      )}

      {(extensionDialog || previewDialog) && (
        <AskDialog
          request={extensionDialog || previewDialog!}
          onRespond={(request, response) => {
            if (extensionDialog) {
              void respondToExtensionUi(request, response);
              closeExtensionDialog();
            } else {
              setPreviewDialog(null);
            }
          }}
        />
      )}
    </div>
  );
}
