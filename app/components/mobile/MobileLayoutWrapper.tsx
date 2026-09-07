import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { WorkspaceFolderData, GitChange, Attachment, ChatMessageData } from '@/types';
import { MobileMainView } from './MobileMainView';
import { MobileSessionSidebar } from './MobileSessionSidebar';
import { MobileRightSidebar } from './MobileRightSidebar';
import { MobileFullEditor } from './mobile-right-sidebar/MobileFullEditor';
import { MobileScreenSwitcher } from './MobileScreenSwitcher';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';
import { streamChatResponse } from '@/hooks/useChatStream';

interface MobileLayoutWrapperProps {
  folders: WorkspaceFolderData[];
  onDesktopToggle?: () => void;
  appSettings?: Record<string, any>;
}

export type MobileScreen = 'main' | 'session' | 'right';

export function MobileLayoutWrapper({ folders, onDesktopToggle, appSettings = {} }: MobileLayoutWrapperProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') ? Number(searchParams.get('sessionId')) : null;
  const folderId = searchParams.get('folderId') ? Number(searchParams.get('folderId')) : null;

  const [currentScreen, setCurrentScreen] = useState<MobileScreen>('main');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(folderId || (folders[0]?.id ?? null));
  const [mobileEditorFile, setMobileEditorFile] = useState<{ name: string; path?: string; content?: string } | null>(null);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [gitChanges, setGitChanges] = useState<GitChange[]>([]);
  const [branch, setBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>(['main', 'feat/mobile-ui', 'fix/dr-smpp']);
  const [syncCount, setSyncCount] = useState(40);

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

  // Load git data
  useEffect(() => {
    fetch('/api/fs/git')
      .then(res => res.json())
      .then(data => {
        if (data.changes && data.changes.length > 0) setGitChanges(data.changes);
        if (data.branch) setBranch(data.branch);
        if (data.branches) setBranches(data.branches);
        if (data.syncCount) setSyncCount(data.syncCount);
      })
      .catch(() => {});
  }, []);

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

  const handleSelectSession = (id: number) => {
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

  const handleCreateFolder = (name: string) => {
    const newId = Date.now();
    folders.push({
      id: newId,
      name,
      isExpanded: true,
      sessions: [],
      hasMore: false,
      totalSessions: 0
    });
    setSelectedFolderId(newId);
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

  const handleGitAction = (actionType: string, file?: string) => {
    const match = (f: string, t: string) => f === t || f.startsWith(t.endsWith('/') ? t : `${t}/`);
    if (actionType === 'revert') setGitChanges(prev => prev.filter(c => !(file ? match(c.file, file) : true)));
    else if (actionType === 'revert_all') setGitChanges(prev => prev.filter(c => c.staged));
    else if (actionType === 'stage') setGitChanges(prev => prev.map(c => (!file || match(c.file, file)) ? { ...c, staged: true } : c));
    else if (actionType === 'stage_all') setGitChanges(prev => prev.map(c => ({ ...c, staged: true })));
    else if (actionType === 'unstage') setGitChanges(prev => prev.map(c => (!file || match(c.file, file)) ? { ...c, staged: false } : c));
    else if (actionType === 'unstage_all') setGitChanges(prev => prev.map(c => ({ ...c, staged: false })));
    else if (actionType === 'push') setSyncCount(0);
  };

  const handleCommit = () => {
    setGitChanges([]);
    setSyncCount(prev => prev + 1);
  };

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
          changes={gitChanges}
          branch={branch}
          branches={branches}
          syncCount={syncCount}
          onBranchChange={setBranch}
          onSync={() => handleGitAction('push')}
          onGitAction={handleGitAction}
          onCommit={handleCommit}
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
