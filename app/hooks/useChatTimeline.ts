import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment } from '@/types';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight >= 100);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  const [inputValue, setInputValue] = useState('');
  const [inputAttachments, setInputAttachments] = useState<Attachment[]>([]);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [sessionData, setSessionData] = useState<{ id?: string; title?: string; model?: string; messages?: any[] } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingVerb, setGeneratingVerb] = useState('');

  // Fetch session messages and details from API
  useEffect(() => {
    let active = true;
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          if (data?.session) {
            setSessionData(data.session);
            setLocalMessages(data.session.messages || []);
          } else {
            setSessionData(null);
            setLocalMessages([]);
          }
        })
        .catch(err => {
          console.error('Error loading session from API:', err);
          if (active) {
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
  }, [sessionId]);

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

  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions?.find((s: any) => String(s.id) === sessionId);
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const [messageQueue, setMessageQueueLocal] = useState<QueuedMessage[]>([]);

  // Initialize queue from DB on mount or session change
  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
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

  const executeSend = useCallback((text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const newUserMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({ name: a.file.name, preview: a.preview }))
    };

    setLocalMessages(prev => {
      const next = [...prev, newUserMsg];
      persistMessages(next);
      return next;
    });
    setIsGenerating(true);

    const verbs = ['Synthesizing solution', 'Deep reasoning', 'Architecting patch', 'Compiling edge routes'];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    setTimeout(() => scrollToBottom('smooth'), 50);

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
      setLocalMessages(prev => {
        const next = [...prev, newAiMsg];
        persistMessages(next);
        return next;
      });
      setIsGenerating(false);
      generationTimeoutRef.current = null;
      triggerChatCompletionSound(appSettings);
      setTimeout(() => scrollToBottom('smooth'), 50);
    }, 2500);
  }, [appSettings, scrollToBottom, persistMessages]);

  // Auto-process queue
  useEffect(() => {
    if (!isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSend(nextMessage.text, nextMessage.attachments);
    }
  }, [isGenerating, messageQueue, executeSend, setMessageQueue]);

  const handleSend = useCallback((attachments: Attachment[], options?: { steering?: boolean }) => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

    if (isGenerating) {
      if (options?.steering) {
        if (generationTimeoutRef.current) {
          clearTimeout(generationTimeoutRef.current);
          generationTimeoutRef.current = null;
        }
        setIsGenerating(false);
        setInputValue('');
        setTimeout(() => executeSend(textToSend, attachments), 0);
        return;
      } else {
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
  }, [inputValue, isGenerating, executeSend, setMessageQueue]);

  const handleEditQueueItem = useCallback((item: QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  }, [setMessageQueue]);

  const handleSendNowQueueItem = useCallback((item: QueuedMessage) => {
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
  }, [isGenerating, executeSend, setMessageQueue]);

  const handleUndo = useCallback((msgId: string, content?: string) => {
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
      const next = idx !== -1 ? prev.slice(0, idx) : prev;
      persistMessages(next);
      return next;
    });
  }, [isGenerating, persistMessages]);

  const handleRetry = useCallback((msgId: string) => {
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
        const next = prev.slice(0, aiIdx);
        persistMessages(next);
        return next;
      }
      return prev;
    });
  }, [isGenerating, executeSend, persistMessages]);

  const submitNewChat = useCallback((text: string, attachments: any[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', `session-${Date.now()}`);
      return next;
    }, { replace: false });

    setLocalMessages([]);
    setTimeout(() => {
      executeSend(text, attachments);
    }, 0);
  }, [setSearchParams, executeSend]);

  return {
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
  };
}
