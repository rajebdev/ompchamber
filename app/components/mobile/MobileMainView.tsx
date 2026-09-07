import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  Check, 
  ArrowDown, 
  Folder, 
  Sparkles
} from 'lucide-react';
import type { Attachment, WorkspaceFolderData } from '@/types';
import { MobileHeader } from './mobile-main-view/MobileHeader';
import { MobileChatInput } from './mobile-main-view/MobileChatInput';
import { ChatMessageItem } from '@/components/workspace/chat-timeline/ChatMessageItem';
import { GeneratingIndicator } from '@/components/workspace/chat-timeline/GeneratingIndicator';
import { QueueList } from '@/components/workspace/chat-timeline/QueueList';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface MobileMainViewProps {
  folders: WorkspaceFolderData[];
  selectedFolderId: number | null;
  onSelectFolder: (id: number | null) => void;
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onOpenSessionSidebar: () => void;
  onOpenRightSidebar: () => void;
  messages: any[];
  onSendMessage: (text: string, attachments: Attachment[], options?: { steering?: boolean }) => void;
  isGenerating?: boolean;
  appSettings?: Record<string, any>;
  messageQueue?: import('@/components/workspace/chat-timeline/QueueList').QueuedMessage[];
  setMessageQueue?: React.Dispatch<React.SetStateAction<import('@/components/workspace/chat-timeline/QueueList').QueuedMessage[]>>;
}

export function MobileMainView({
  folders,
  selectedFolderId,
  onSelectFolder,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSessionSidebar,
  onOpenRightSidebar,
  messages,
  onSendMessage,
  isGenerating = false,
  appSettings = {},
  messageQueue = [],
  setMessageQueue = () => {}
}: MobileMainViewProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputAttachments, setInputAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  // Workspace Picker dropdown state
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(workspacePickerRef, () => setShowWorkspacePicker(false));

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, isGenerating]);

  // Find active session title
  const activeSessionTitle = useMemo(() => {
    if (!activeSessionId) return 'New session';
    for (const f of folders) {
      const found = f.sessions?.find(s => s.id === activeSessionId);
      if (found) return found.title;
    }
    return `Session #${activeSessionId}`;
  }, [activeSessionId, folders]);

  // Find active project/folder
  const activeProject = useMemo(() => {
    return folders.find(f => f.id === selectedFolderId);
  }, [folders, selectedFolderId]);

  const handleSend = (attachments: Attachment[], options?: { steering?: boolean }) => {
    onSendMessage(inputValue, attachments, options);
    setInputValue('');
    setInputAttachments([]);
  };

  const handleEditQueueItem = (item: import('@/components/workspace/chat-timeline/QueueList').QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  };

  const handleSendNowQueueItem = (item: import('@/components/workspace/chat-timeline/QueueList').QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    onSendMessage(item.text, item.attachments, { steering: true });
  };

  const promptSuggestions = [
    "Run diagnostic check on edge routes",
    "Inspect failing bun build logs",
    "Show git diff on feat/dr-smpp"
  ];

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-ink relative select-none">
      
      {/* Top Header Bar */}
      <MobileHeader
        activeSessionTitle={activeSessionTitle}
        activeSessionId={activeSessionId}
        folders={folders}
        onOpenSessionSidebar={onOpenSessionSidebar}
        onOpenRightSidebar={onOpenRightSidebar}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        
        {/* Scrollable message timeline or empty canvas */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-6"
        >
          {messages.length === 0 ? (
            /* Empty Workspace Prompt Suggestions */
            <div className="h-full flex flex-col justify-center items-center text-center p-4">
              <div className="w-10 h-10 rounded-2xl bg-ink/5 flex items-center justify-center text-ink/60 mb-3">
                <Sparkles size={20} />
              </div>
              <h2 className="text-sm font-semibold text-ink mb-1">
                {activeProject ? activeProject.name : 'OMPChamber Workspace'}
              </h2>
              <p className="text-xs text-ink/50 max-w-xs mb-4">
                Ask a question, diagnose build output, or select a quick starter prompt below.
              </p>
              <div className="flex flex-col space-y-1.5 w-full max-w-xs">
                {promptSuggestions.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInputValue(promptText)}
                    className="text-left px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:border-ink/30 text-xs text-ink/80 hover:text-ink transition-all"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <ChatMessageItem 
                  key={msg.id} 
                  msg={msg} 
                  modelName="DeepSeek V4 Pro"
                  onUndo={(_id, content) => {
                    if (content) setInputValue(content);
                  }}
                />
              ))}
              {isGenerating && (
                <GeneratingIndicator 
                  modelName="DeepSeek V4 Pro" 
                  generatingVerb="thinking" 
                />
              )}
            </>
          )}
        </div>

        {/* Scroll To Bottom Button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-24 right-4 z-20 w-8 h-8 rounded-full bg-paper border border-ink/20 shadow-md flex items-center justify-center text-ink hover:bg-ink/5 transition-all"
            title="Scroll to bottom"
          >
            <ArrowDown size={14} />
          </button>
        )}

        {/* Bottom Section: Workspace Selector + Chat Input Box */}
        <div className="p-3 pt-2 bg-canvas border-t border-ink/10 flex-shrink-0 space-y-2">
          
          {/* Workspace Selection Seamless Dropdown (No border, transparent background) */}
          <div className="relative inline-block" ref={workspacePickerRef}>
            <button
              type="button"
              onClick={() => setShowWorkspacePicker(!showWorkspacePicker)}
              className="group flex items-center space-x-1.5 px-1.5 py-1 rounded-md text-xs font-medium text-ink/75 hover:text-ink hover:bg-ink/5 focus-visible:bg-ink/5 transition-all outline-none cursor-pointer select-none max-w-[260px]"
            >
              <Folder size={13} className="text-ink/50 group-hover:text-ink/80 flex-shrink-0 transition-colors" />
              <span className="truncate font-sans tracking-tight">
                {activeProject ? activeProject.name : 'Select Workspace Context'}
              </span>
              <ChevronDown size={13} className={`text-ink/40 group-hover:text-ink/70 flex-shrink-0 transition-transform duration-150 ${showWorkspacePicker ? 'rotate-180 text-ink/70' : ''}`} />
            </button>

            {showWorkspacePicker && (
              <div className="absolute bottom-full left-0 mb-1.5 w-60 bg-paper border border-ink/10 rounded-lg shadow-lg z-50 flex flex-col overflow-hidden text-xs py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink/40 font-semibold border-b border-ink/5">
                  Target Workspace
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {folders.length === 0 ? (
                    <div className="px-3 py-2 text-ink/40 italic">No workspaces available</div>
                  ) : (
                    folders.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          onSelectFolder(f.id);
                          setShowWorkspacePicker(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                          selectedFolderId === f.id
                            ? 'bg-ink/10 font-semibold text-ink'
                            : 'hover:bg-ink/5 text-ink/80 hover:text-ink'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <Folder size={12} className={selectedFolderId === f.id ? "text-ink flex-shrink-0" : "text-ink/50 flex-shrink-0"} />
                          <span className="truncate font-medium">{f.name}</span>
                        </div>
                        {selectedFolderId === f.id && (
                          <Check size={12} className="text-ink flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Box */}
          <QueueList 
            queue={messageQueue} 
            setQueue={setMessageQueue} 
            onEdit={handleEditQueueItem} 
            onSendNow={handleSendNowQueueItem}
          />
          <MobileChatInput
            value={inputValue}
            onChange={setInputValue}
            attachments={inputAttachments}
            onAttachmentsChange={setInputAttachments}
            onSend={handleSend}
            isGenerating={isGenerating}
            disabled={!selectedFolderId}
            appSettings={appSettings}
          />
        </div>

      </div>
    </div>
  );
}
