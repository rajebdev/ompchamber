import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, ArrowDown, Lightbulb } from 'lucide-react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment } from '@/types';
import { ChatInput } from './chat-timeline/ChatInput';
import { ChatMessageItem } from './chat-timeline/ChatMessageItem';
import { MinimapShortcuts } from './chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from './chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from './chat-timeline/GeneratingIndicator';
import { QueueList } from './chat-timeline/QueueList';
import { NewChatModal } from './chat-timeline/NewChatModal';
import { getSessionData } from '@/data/chatMockData';

export function ChatTimeline({ className = '', folders = [], appSettings = {} }: { className?: string, folders?: any[], appSettings?: Record<string, any> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const folderId = searchParams.get('folderId');

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    if (folderId) {
      setSelectedFolderId(parseInt(folderId, 10));
    } else {
      setSelectedFolderId(null);
    }
  }, [folderId]);

  // Scroll to bottom logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollBottom(!isNearBottom);
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  const [inputValue, setInputValue] = useState('');
  const [inputAttachments, setInputAttachments] = useState<Attachment[]>([]);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingVerb, setGeneratingVerb] = useState('');

  // Extended dummy logic for multiple turns
  const sessionData = useMemo(() => {
    return getSessionData(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (sessionData) {
      setLocalMessages(sessionData.messages);
    } else {
      setLocalMessages([]);
    }
  }, [sessionData]);

  // Auto-scroll to bottom instantly when session changes
  useEffect(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom('instant' as ScrollBehavior);
        setShowScrollBottom(false);
      }, 0);
    });
  }, [sessionId, localMessages.length]);

  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions.find((s: any) => String(s.id) === sessionId);
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const [messageQueue, setMessageQueueLocal] = useState<import('./chat-timeline/QueueList').QueuedMessage[]>([]);

  // Initialize queue from DB on mount or session change
  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<import('./chat-timeline/QueueList').QueuedMessage[]>) => {
    setMessageQueueLocal(prev => {
      const newQueue = typeof updater === 'function' ? updater(prev) : updater;
      if (sessionId) {
        fetch(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_list: newQueue })
        }).catch(console.error);
      }
      return newQueue;
    });
  }, [sessionId]);

  // Auto-process queue
  useEffect(() => {
    if (!isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSend(nextMessage.text, nextMessage.attachments);
    }
  }, [isGenerating, messageQueue.length]);

  const executeSend = (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const newUserMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({ name: a.file.name, preview: a.preview }))
    };

    setLocalMessages(prev => [...prev, newUserMsg]);
    setIsGenerating(true);
    
    const verbs = [
      'Synthesizing solution',
      'Deep reasoning',
      'Architecting patch',
      'Deconstructing AST',
      'Compiling edge routes',
      'Analyzing runtime context',
      'Optimizing code structure'
    ];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Simulate realistic multi-step AI reasoning and tool calls
    generationTimeoutRef.current = setTimeout(() => {
      const newAiMsg = {
        id: `msg-${Date.now()}-ai`,
        role: 'ai',
        date: `Today, ${time}`,
        thinking: {
          duration: "2.1s",
          summary: "Deconstruct prompt, execute workspace diagnostics, and formulate implementation patch.",
          thought: `1. User requested: "${text}".\n2. Inspecting project context and Bun runtime dependencies.\n3. Running diagnostic checks against active edge endpoints.\n4. Compiling resolution output.`
        },
        toolCalls: [
          {
            id: `tc-${Date.now()}-read`,
            type: 'read_file' as const,
            title: 'Read File',
            target: 'examples/index.js',
            command: 'read_file examples/index.js',
            output: `// examples/index.js\nimport { createServer } from 'http';\n\nconst port = process.env.PORT || 3000;\nconst server = createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ status: 'healthy', runtime: 'bun' }));\n});\n\nserver.listen(port, () => {\n  console.log(\`Server running at http://localhost:\${port}/\`);\n});`,
            status: 'success' as const,
            duration: '18ms'
          },
          {
            id: `tc-${Date.now()}-1`,
            type: 'bash' as const,
            title: 'Diagnostic Command',
            target: 'bun --version && bun pm ls',
            command: 'bun --version && bun pm ls',
            output: 'Bun v1.2.4\n├── @remis/edge@1.0.4\n├── lucide-react@0.475.0\n└── tailwindcss@4.0.0',
            status: 'success' as const,
            duration: '85ms'
          }
        ],
        content: `I've processed your request: "${text}". The runtime environment is healthy and all diagnostics passed successfully.`,
        summary: "Execution completed in 2.3s with 0 errors."
      };
      setLocalMessages(prev => [...prev, newAiMsg]);
      setIsGenerating(false);
      generationTimeoutRef.current = null;
      setTimeout(() => scrollToBottom('smooth'), 50);
    }, 2500);
  };

  const handleSend = (attachments: Attachment[], options?: { steering?: boolean }) => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

    if (isGenerating) {
      if (options?.steering) {
        // Cancel current generation and execute immediately
        if (generationTimeoutRef.current) {
          clearTimeout(generationTimeoutRef.current);
          generationTimeoutRef.current = null;
        }
        setIsGenerating(false);
        setInputValue('');
        
        // Use a tiny timeout to let state settle before starting new generation
        setTimeout(() => executeSend(textToSend, attachments), 0);
        return;
      } else {
        // Add to queue
        setMessageQueue(prev => [...prev, {
          id: `queue-${Date.now()}`,
          text: textToSend,
          attachments: attachments
        }]);
        setInputValue('');
        return;
      }
    }

    setInputValue('');
    executeSend(textToSend, attachments);
  };

  const handleEditQueueItem = (item: import('./chat-timeline/QueueList').QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  };

  const handleSendNowQueueItem = (item: import('./chat-timeline/QueueList').QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    
    if (isGenerating) {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
      setIsGenerating(false);
      setTimeout(() => executeSend(item.text, item.attachments), 0);
    } else {
      executeSend(item.text, item.attachments);
    }
  };

  const userMessages = localMessages.filter(m => m.role === 'user');

  const handleUndo = (msgId: string, content?: string) => {
    if (isGenerating) {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
      setIsGenerating(false);
    }
    
    if (content) {
      setInputValue(content);
    }
    
    setLocalMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        return prev.slice(0, idx);
      }
      return prev;
    });
  };

  const handleRetry = (msgId: string) => {
    if (isGenerating) {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
      setIsGenerating(false);
    }

    setLocalMessages(prev => {
      const aiIdx = prev.findIndex(m => m.id === msgId);
      if (aiIdx > 0 && prev[aiIdx - 1].role === 'user') {
        const userMsg = prev[aiIdx - 1];
        setTimeout(() => {
          executeSend(userMsg.content, userMsg.attachments || []);
        }, 0);
        return prev.slice(0, aiIdx);
      }
      return prev;
    });
  };

  const [newChatInitialContent, setNewChatInitialContent] = useState<string | null>(null);

  const handleNewChatFromMessage = (content: string) => {
    setNewChatInitialContent(content);
  };

  const submitNewChat = (text: string, attachments: any[]) => {
    // Navigate to a new session in the same folder or simulate
    // For now, simulate by clearing messages and sending
    
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', `session-${Date.now()}`);
      return next;
    }, { replace: false });
    
    setLocalMessages([]);
    setTimeout(() => {
      executeSend(text, attachments);
    }, 0);
  };

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

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
          className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth overflow-x-hidden"
        >
          {localMessages.map((msg) => (
            <ChatMessageItem 
              key={msg.id} 
              msg={msg} 
              modelName={sessionData?.model} 
              onUndo={handleUndo}
              onRetry={handleRetry}
              onNewChat={handleNewChatFromMessage}
            />
          ))}

          {isGenerating && (
            <GeneratingIndicator 
              modelName={sessionData?.model} 
              generatingVerb={generatingVerb} 
            />
          )}
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
      
      {/* Input Area Footer */}
      <div className="p-4 bg-canvas border-t border-ink/10 flex-shrink-0">
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
