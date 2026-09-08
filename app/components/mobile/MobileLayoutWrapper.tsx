import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { WorkspaceFolderData, Attachment, ChatMessageData } from '@/types';
import { MobileMainView } from '@/components/mobile/MobileMainView';
import { MobileSessionSidebar } from '@/components/mobile/MobileSessionSidebar';
import { MobileRightSidebar } from '@/components/mobile/MobileRightSidebar';
import { MobileFullEditor } from '@/components/mobile/mobile-right-sidebar/MobileFullEditor';
import { MobileScreenSwitcher } from '@/components/mobile/MobileScreenSwitcher';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';
import { streamChatResponse } from '@/hooks/useChatStream';
import { activeProjectForSession } from '@/lib/activeProject';

interface MobileLayoutWrapperProps {
  folders: WorkspaceFolderData[];
  onDesktopToggle?: () => void;
  appSettings?: Record<string, any>;
}

export type MobileScreen = 'main' | 'session' | 'right';

export function MobileLayoutWrapper({ folders, onDesktopToggle, appSettings = {} }: MobileLayoutWrapperProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');
  const sessionId = sessionParam ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam)) : null;
  const folderParam = searchParams.get('folderId');
  const folderId = folderParam ? (Number.isNaN(Number(folderParam)) ? folderParam : Number(folderParam)) : null;

  const [currentScreen, setCurrentScreen] = useState<MobileScreen>('main');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
    typeof folderId === 'number' ? folderId : null
  );
  const [mobileEditorFile, setMobileEditorFile] = useState<{ name: string; path?: string; content?: string; root?: string } | null>(null);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { folder: sessionFolder } = activeProjectForSession(folders, sessionId);
  const contextFolder = sessionFolder ?? (folderId ? folders.find(f => String(f.id) === String(folderId)) ?? null : null);
  const activeProjectPath = contextFolder?.project_path ?? null;
  const hasContext = !!contextFolder;

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

  // Listen to open-file event on mobile
  useEffect(() => {
    const handleCustomOpenFile = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name?: string; content?: string }>;
      if (!customEvent.detail || !customEvent.detail.path) return;
      const rawPath = customEvent.detail.path.replace(/^\/+/, '');
      const name = customEvent.detail.name || rawPath.split('/').pop() || 'file';
      setMobileEditorFile({ name, path: rawPath, content: customEvent.detail.content });
    };

    window.addEventListener('omp:open-file', handleCustomOpenFile);
    return () => window.removeEventListener('omp:open-file', handleCustomOpenFile);
  }, []);

  const handleSelectSession = (id: number | string) => {
    setSearchParams(prev => {
      prev.set('sessionId', id.toString());
      return prev;
    }, { replace: true });
    setCurrentScreen('main');
  };

  const handleNewSession = () => {
    setSearchParams(prev => {
      prev.delete('sessionId');
      return prev;
    }, { replace: true });
    setMessages([]);
    setCurrentScreen('main');
  };

  const handleSelectFolder = (id: number | null) => {
    setSelectedFolderId(id);
    if (id) {
      setSearchParams(prev => {
        prev.set('folderId', id.toString());
        return prev;
      }, { replace: true });
    }
  };

  const handleCreateFolder = async (input: { name: string; path?: string }) => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    window.location.reload();
  };

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions.find((s: any) => String(s.id) === String(sessionId));
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const [messageQueue, setMessageQueueLocal] = useState<import('@/components/workspace/chat-timeline/QueueList').QueuedMessage[]>([]);

  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<import('@/components/workspace/chat-timeline/QueueList').QueuedMessage[]>) => {
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

  const handleSendMessage = (text: string, attachments: Attachment[], options?: { steering?: boolean }) => {
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
      } else {
        setMessageQueue(prev => [...prev, { id: `queue-${Date.now()}`, text, attachments }]);
        return;
      }
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

  const handleOpenFile = useCallback((file: any) => {
    const rawPath = (file?.path || '').replace(/^\/+/, '');
    const name = file?.name || rawPath.split('/').pop() || 'file';
    setMobileEditorFile({
      name,
      path: rawPath,
      content: file?.content,
      root: file?.root ?? activeProjectPath ?? undefined,
    });
  }, [activeProjectPath]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-ink selection:text-canvas relative">
      <MobileScreenSwitcher
        currentScreen={currentScreen}
        onSelectScreen={setCurrentScreen}
        onDesktopToggle={onDesktopToggle}
      />

      <div className={`h-full w-full ${currentScreen === 'main' ? 'block' : 'hidden'}`}>
        <MobileMainView
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onOpenSessionSidebar={() => setCurrentScreen('session')}
          onOpenRightSidebar={() => setCurrentScreen('right')}
          messages={messages}
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
          appSettings={appSettings}
          messageQueue={messageQueue}
          setMessageQueue={setMessageQueue}
        />
      </div>

      <div className={`h-full w-full ${currentScreen === 'session' ? 'block' : 'hidden'}`}>
        <MobileSessionSidebar
          folders={folders}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onCreateFolder={handleCreateFolder}
          onClose={() => setCurrentScreen('main')}
          appSettings={appSettings}
        />
      </div>

      <div className={`h-full w-full ${currentScreen === 'right' ? 'block' : 'hidden'}`}>
        <MobileRightSidebar
          enabled={hasContext}
          rootPath={activeProjectPath ?? undefined}
          onOpenFile={handleOpenFile}
          onClose={() => setCurrentScreen('main')}
        />
      </div>

      {mobileEditorFile && (
        <MobileFullEditor
          file={mobileEditorFile}
          onClose={() => setMobileEditorFile(null)}
        />
      )}
    </div>
  );
}
