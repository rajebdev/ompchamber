import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SetStateAction } from 'react';
import type { WorkspaceFolderData, Attachment, ChatMessageData } from '@/types';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import { triggerChatCompletionSound } from '@/hooks/ui/notification-sound';
import { streamChatResponse } from '@/hooks/chat/stream';

export interface UseMobileChatSessionParams {
  folders: WorkspaceFolderData[];
  sessionId: number | string | null;
  selectedFolderId: number | null;
  appSettings: Record<string, any>;
}

export function useMobileChatSession({ folders, sessionId, selectedFolderId, appSettings }: UseMobileChatSessionParams) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load session messages via API
  useEffect(() => {
    let active = true;
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          setMessages(data?.session?.messages || []);
        })
        .catch(err => {
          console.error('Mobile chat API error:', err);
          if (active) setMessages([]);
        });
    } else {
      setMessages([]);
    }
    return () => { active = false; };
  }, [sessionId]);

  const persistMessages = useCallback((nextMessages: any[]) => {
    if (!sessionId) return;
    fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: nextMessages }),
    }).catch(console.error);
  }, [sessionId]);

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions.find((s: any) => String(s.id) === String(sessionId));
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const [messageQueue, setMessageQueueLocal] = useState<QueuedMessage[]>([]);

  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = useCallback((updater: SetStateAction<QueuedMessage[]>) => {
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

  const executeSendMessage = useCallback(async (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const aiPlaceholderId = `msg-${Date.now() + 1}-ai`;

    const userMsg: ChatMessageData = {
      id: userMsgId,
      role: 'user',
      timestamp: time,
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({ id: a.id, name: a.file.name, type: a.file.type, size: a.file.size, preview: a.preview }))
    };

    const initialAiMsg: ChatMessageData = {
      id: aiPlaceholderId,
      role: 'ai',
      date: `Today, ${time}`,
      content: '',
    };

    setMessages(prev => {
      const next = [...prev, userMsg, initialAiMsg];
      persistMessages(next.filter(m => m.id !== aiPlaceholderId));
      return next;
    });

    setIsGenerating(true);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentFolder = folders.find(f => f.id === selectedFolderId);
    const workspaceName = currentFolder?.name || 'Workspace';

    await streamChatResponse(
      {
        sessionId: sessionId ? String(sessionId) : `session-${Date.now()}`,
        prompt: text,
        workspaceName,
        attachments,
        signal: abortController.signal,
      },
      {
        onInit: (data) => {
          setMessages(prev => prev.map(m => (m.id === aiPlaceholderId ? { ...m, id: data.id, date: data.date } : m)));
        },
        onThinkingChunk: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              const currentThought = typeof m.thinking === 'object' ? m.thinking.thought || '' : '';
              return { ...m, thinking: { thought: currentThought + data.delta, isGenerating: true } };
            }
            return m;
          }));
        },
        onThinkingEnd: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              return { ...m, thinking: { thought: data.thought, summary: data.summary, duration: data.duration, isGenerating: false } };
            }
            return m;
          }));
        },
        onToolStart: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              return { ...m, toolCalls: [...(m.toolCalls || []), data] };
            }
            return m;
          }));
        },
        onToolEnd: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              return { ...m, toolCalls: (m.toolCalls || []).map(t => (t.id === data.id ? { ...t, ...data } : t)) };
            }
            return m;
          }));
        },
        onContentChunk: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              return { ...m, content: (m.content || '') + data.delta };
            }
            return m;
          }));
        },
        onSummary: (data) => {
          setMessages(prev => prev.map(m => {
            if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
              return { ...m, summary: data.summary };
            }
            return m;
          }));
        },
        onDone: (data) => {
          setMessages(prev => {
            const updated = prev.map(m => (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id) ? data.message : m));
            persistMessages(updated);
            return updated;
          });
          setIsGenerating(false);
          abortControllerRef.current = null;
          triggerChatCompletionSound(appSettings);
        },
        onError: () => {
          setIsGenerating(false);
          abortControllerRef.current = null;
        }
      }
    );
  }, [appSettings, folders, selectedFolderId, sessionId, persistMessages]);

  useEffect(() => {
    if (!isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSendMessage(nextMessage.text, nextMessage.attachments);
    }
  }, [isGenerating, messageQueue, executeSendMessage, setMessageQueue]);

  const handleSendMessage = async (text: string, attachments: Attachment[], options?: { steering?: boolean }) => {
    if (!text.trim() && attachments.length === 0) return;

    if (isGenerating) {
      if (options?.steering) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsGenerating(false);
        setTimeout(() => executeSendMessage(text, attachments), 0);
        return;
      }
      const behavior = appSettings.omp_chamber_settings?.followUpBehavior ?? appSettings.followUpBehavior ?? 'queue';
      if (behavior === 'steering') {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsGenerating(false);
        setTimeout(() => executeSendMessage(text, attachments), 0);
        return;
      }
      setMessageQueue(prev => [...prev, { id: `queue-${Date.now()}`, text, attachments }]);
      return;
    }

    executeSendMessage(text, attachments);
  };

  const handleStopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  return {
    messages,
    setMessages,
    isGenerating,
    messageQueue,
    setMessageQueue,
    handleSendMessage,
    handleStopGenerating,
  };
}
