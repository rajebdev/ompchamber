import React, { useState } from 'react';
import { MoreHorizontal, ArrowDown } from 'lucide-react';
import { ChatInput } from './chat-timeline/ChatInput';
import { ChatMessageItem } from './chat-timeline/ChatMessageItem';
import { MinimapShortcuts } from './chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from './chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from './chat-timeline/GeneratingIndicator';
import { QueueList } from './chat-timeline/QueueList';
import { NewChatModal } from './chat-timeline/NewChatModal';
import { useChatTimeline } from '@/hooks/useChatTimeline';

interface ChatTimelineProps {
  className?: string;
  folders?: any[];
  appSettings?: Record<string, any>;
}

export function ChatTimeline({ className = '', folders = [], appSettings = {} }: ChatTimelineProps) {
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
    <div className={`flex flex-col h-full bg-canvas relative ${className}`}>
      {/* Timeline Header */}
      <div className="flex-shrink-0 h-12 flex items-center justify-between px-4 bg-paper border-b border-ink/10 z-10">
        <div className="flex flex-col justify-center">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-xs text-ink">{sessionData?.title}</h3>
            <MoreHorizontal size={14} className="text-ink/40 hover:text-ink cursor-pointer" />
          </div>
          <div className="text-[10px] font-mono text-ink/60 leading-none mt-0.5">
            Workspace <span className="mx-1">⎇</span> main
          </div>
        </div>
      </div>

      {/* Minimap Shortcuts */}
      <MinimapShortcuts 
        userMessages={userMessages} 
        onScrollTo={handleScrollTo} 
      />

      {/* Main chat container wrapper */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Timeline Body */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth overflow-x-hidden pb-10"
        >
          {localMessages.map((msg, idx) => (
            <ChatMessageItem 
              key={msg.id} 
              msg={msg} 
              modelName={sessionData?.model} 
              isStreaming={isGenerating && idx === localMessages.length - 1 && msg.role === 'ai'}
              generatingVerb={generatingVerb}
              onUndo={handleUndo}
              onRetry={handleRetry}
              onNewChat={(content) => setNewChatInitialContent(content)}
            />
          ))}
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
