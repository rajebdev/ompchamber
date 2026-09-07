import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment, ChatMessageData, ToolCallData, ThinkingData } from '@/types';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';
import { streamChatResponse } from '@/hooks/useChatStream';

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
  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [sessionData, setSessionData] = useState<{ id?: string; title?: string; model?: string; messages?: any[] } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingVerb, setGeneratingVerb] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions?.find((s: any) => String(s.id) === String(sessionId));
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
      // Queue persistence targets the SQLite `sessions` table (mock/numeric
      // sessions). omp sessions (string UUIDs) have no such row — keep the
      // queue client-side only for this session.
      if (sessionId && !Number.isNaN(Number(sessionId))) {
        fetch(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_list: newQueue })
        }).catch(console.error);
      }
      return newQueue;
    });
  }, [sessionId]);

  const executeSend = useCallback(async (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const aiPlaceholderId = `msg-${Date.now() + 1}-ai`;

    const newUserMsg: ChatMessageData = {
      id: userMsgId,
      role: 'user',
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({ name: a.file.name, preview: a.preview }))
    };

    const initialAiMsg: ChatMessageData = {
      id: aiPlaceholderId,
      role: 'ai',
      date: `Today, ${time}`,
      content: '',
    };

    setLocalMessages(prev => {
      const next = [...prev, newUserMsg, initialAiMsg];
      persistMessages(next.filter(m => m.id !== aiPlaceholderId));
      return next;
    });

    setIsGenerating(true);
    const verbs = ['Synthesizing solution', 'Deep reasoning', 'Architecting patch', 'Compiling edge routes'];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Cancel any previous stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentFolder = folders.find(f => String(f.id) === String(selectedFolderId));
    const workspaceName = currentFolder?.name || 'Workspace';

    await streamChatResponse(
      {
        sessionId: sessionId || `session-${Date.now()}`,
        prompt: text,
        workspaceName,
        attachments,
        signal: abortController.signal,
      },
      {
        onInit: (data) => {
          setLocalMessages(prev =>
            prev.map(m => (m.id === aiPlaceholderId ? { ...m, id: data.id, date: data.date } : m))
          );
        },
        onThinkingStart: () => {
          setLocalMessages(prev =>
            prev.map(m =>
              m.id === aiPlaceholderId || m.role === 'ai'
                ? { ...m, thinking: { thought: '', isGenerating: true } }
                : m
            )
          );
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onThinkingChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                const currentThought = typeof m.thinking === 'object' ? m.thinking.thought || '' : '';
                return {
                  ...m,
                  thinking: { thought: currentThought + data.delta, isGenerating: true },
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onThinkingEnd: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  thinking: {
                    thought: data.thought,
                    summary: data.summary,
                    duration: data.duration,
                    isGenerating: false,
                  },
                };
              }
              return m;
            })
          );
        },
        onToolStart: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: [...(m.toolCalls || []), data],
                };
              }
              return m;
            })
          );
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onToolOutputChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: (m.toolCalls || []).map(t =>
                    t.id === data.id ? { ...t, output: (t.output || '') + data.delta } : t
                  ),
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onToolEnd: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: (m.toolCalls || []).map(t => (t.id === data.id ? { ...t, ...data } : t)),
                };
              }
              return m;
            })
          );
        },
        onContentChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  content: (m.content || '') + data.delta,
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onSummary: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return { ...m, summary: data.summary };
              }
              return m;
            })
          );
        },
        onDone: (data) => {
          setLocalMessages(prev => {
            const updated = prev.map(m =>
              m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)
                ? data.message
                : m
            );
            persistMessages(updated);
            return updated;
          });
          setIsGenerating(false);
          abortControllerRef.current = null;
          triggerChatCompletionSound(appSettings);
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onError: () => {
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
      }
    );
  }, [appSettings, folders, selectedFolderId, sessionId, scrollToBottom, persistMessages]);

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
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
      setTimeout(() => executeSend(item.text, item.attachments), 0);
    } else {
      executeSend(item.text, item.attachments);
    }
  }, [isGenerating, executeSend, setMessageQueue]);

  const handleUndo = useCallback((msgId: string, content?: string) => {
    if (isGenerating) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }

    setLocalMessages(prev => {
      const aiIdx = prev.findIndex(m => m.id === msgId);
      if (aiIdx > 0 && prev[aiIdx - 1].role === 'user') {
        const userMsg = prev[aiIdx - 1];
        setTimeout(() => {
          executeSend(userMsg.content, (userMsg.attachments as any) || []);
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

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

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
    stopGenerating,
  };
}
