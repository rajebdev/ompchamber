import React, { useState, useEffect } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatInput } from './chat-timeline/ChatInput';
import { ChatMessageItem } from './chat-timeline/ChatMessageItem';
import { MinimapShortcuts } from './chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from './chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from './chat-timeline/GeneratingIndicator';
import { QueueList } from './chat-timeline/QueueList';
import { NewChatModal } from './chat-timeline/NewChatModal';
import { useChatTimeline } from '@/hooks/useChatTimeline';
import { responseRunDurationMs } from '@/lib/chat-duration';

interface ChatTimelineProps {
  className?: string;
  folders?: any[];
  appSettings?: Record<string, any>;
  onSessionTitle?: (title: string | null) => void;
}

export function ChatTimeline({ className = '', folders = [], appSettings = {}, onSessionTitle }: ChatTimelineProps) {
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
  } = useChatTimeline({ folders, appSettings });

  const [newChatInitialContent, setNewChatInitialContent] = useState<string | null>(null);

  useEffect(() => {
    onSessionTitle?.(sessionData?.title ?? null);
  }, [sessionData?.title, onSessionTitle]);

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const userMessages = localMessages.filter(m => m.role === 'user');

  if (!sessionId) {
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
      />
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-hidden bg-canvas relative ${className}`}>
      {/* Main chat container wrapper */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Minimap Shortcuts */}
        <MinimapShortcuts 
          userMessages={userMessages} 
          onScrollTo={handleScrollTo} 
        />

        {/* Timeline Body */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-[overlay] overscroll-contain p-4 scroll-smooth overflow-x-hidden pb-10 ${
            isScrolling ? 'timeline-scrollbar-visible' : 'timeline-scrollbar-hidden'
          }`}
        >
          <div className="mx-auto w-full max-w-[970px]">
            {localMessages.map((msg, idx) => {
              const prev = localMessages[idx - 1];
              const next = localMessages[idx + 1];
              const isLoading = isGenerating && idx === localMessages.length - 1 && msg.role === 'ai';
              const isLastAi = msg.role !== 'user' && (!next || next.role === 'user');
              const isAiFragment = msg.role !== 'user' && prev && prev.role !== 'user';
              return (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  modelName={sessionData?.model}
                  isStreaming={isLoading}
                  generatingVerb={generatingVerb}
                  onUndo={handleUndo}
                  onRetry={handleRetry}
                  onNewChat={(content) => setNewChatInitialContent(content)}
                  footerVisible={isLastAi}
                  durationMs={isLastAi ? responseRunDurationMs(localMessages, idx) : null}
                  className={isAiFragment ? 'mt-1' : 'mt-8'}
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
      </div>
      
      {/* Input Area Footer with Docked Generating Indicator (Seamless & Transparent) */}
      <div className="p-4 pt-1 bg-transparent border-t-0 flex-shrink-0 space-y-2">
        <div className="mx-auto w-full max-w-[970px]">
          {isGenerating && (
            <GeneratingIndicator 
              modelName={sessionData?.model} 
              generatingVerb={generatingVerb} 
            />
          )}
          <QueueList 
            queue={messageQueue} 
            setQueue={setMessageQueue} 
            onEdit={handleEditQueueItem} 
            onSendNow={handleSendNowQueueItem}
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
          />
        </div>
      </div>

      {newChatInitialContent !== null && (
        <NewChatModal
          initialContent={newChatInitialContent}
          onClose={() => setNewChatInitialContent(null)}
          onSend={submitNewChat}
          appSettings={appSettings}
        />
      )}
    </div>
  );
}
