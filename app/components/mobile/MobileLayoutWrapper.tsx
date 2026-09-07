import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import { Terminal } from 'lucide-react';
import type { WorkspaceFolderData, GitChange, Attachment } from '@/types';
import { MobileMainView } from './MobileMainView';
import { MobileSessionSidebar } from './MobileSessionSidebar';
import { MobileRightSidebar } from './MobileRightSidebar';
import { MobileFullEditor } from './mobile-right-sidebar/MobileFullEditor';
import { getSessionData } from '@/data/chatMockData';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';

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

  // Chat message state
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Git state
  const [gitChanges, setGitChanges] = useState<GitChange[]>([]);
  const [branch, setBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>(['main', 'feat/mobile-ui', 'fix/dr-smpp']);
  const [syncCount, setSyncCount] = useState(40);

  // Load session messages when sessionId changes
  useEffect(() => {
    if (sessionId) {
      const data = getSessionData(sessionId.toString());
      if (data && data.messages) {
        setMessages(data.messages);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  // Load git data
  useEffect(() => {
    fetch('/api/fs/git')
      .then(res => res.json())
      .then(data => {
        if (data.changes && data.changes.length > 0) {
          setGitChanges(data.changes);
        }
        if (data.branch) setBranch(data.branch);
        if (data.branches) setBranches(data.branches);
        if (data.syncCount) setSyncCount(data.syncCount);
      })
      .catch(() => {
        // Fallback already built into component
      });
  }, []);

  // Listen to open-file event on mobile
  useEffect(() => {
    const handleCustomOpenFile = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name?: string; content?: string }>;
      if (!customEvent.detail || !customEvent.detail.path) return;
      const rawPath = customEvent.detail.path.replace(/^\/+/, '');
      const name = customEvent.detail.name || rawPath.split('/').pop() || 'file';
      setMobileEditorFile({
        name,
        path: rawPath,
        content: customEvent.detail.content
      });
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
    // In-memory or API creation
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
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize queue from DB on mount or session change
  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = React.useCallback((updater: React.SetStateAction<import('@/components/workspace/chat-timeline/QueueList').QueuedMessage[]>) => {
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

  useEffect(() => {
    if (!isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSendMessage(nextMessage.text, nextMessage.attachments);
    }
  }, [isGenerating, messageQueue.length]);

  const executeSendMessage = (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      timestamp: time,
      date: time,
      content: text,
      attachments: attachments.map(a => ({
        id: a.id,
        name: a.file.name,
        type: a.file.type,
        size: a.file.size,
        preview: a.preview
      }))
    };

    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    // Realistic assistant reply with thinking and tool calling
    generationTimeoutRef.current = setTimeout(() => {
      const assistantMsg = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        thinking: {
          duration: '1.6s',
          summary: 'Inspect mobile workspace context, verify bun edge adapter and bundle telemetry.',
          thought: `1. User prompt: "${text}".\n2. Target workspace: ${folders.find(f => f.id === selectedFolderId)?.name || 'Workspace'}.\n3. Verifying edge route signatures and bun runtime health.\n4. Formatting response for mobile viewport.`
        },
        toolCalls: [
          {
            id: `mtc-${Date.now()}-1`,
            type: 'bash' as const,
            title: 'Bun Runner Check',
            target: 'bun run build',
            command: 'bun run build',
            output: '✓ 14 modules bundled without errors in 82ms.',
            status: 'success' as const,
            duration: '142ms'
          }
        ],
        content: `I've analyzed your request: "${text}".\n\n- Target project: **${folders.find(f => f.id === selectedFolderId)?.name || 'Workspace'}**\n- Runtime: Bun v1.2.4 with remisJS edge adapter\n- CI/CD telemetry status: Ready.`,
        summary: 'Workspace verification complete.'
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsGenerating(false);
      generationTimeoutRef.current = null;
      triggerChatCompletionSound(appSettings);
    }, 1200);
  };

  // Send message in mobile chat
  const handleSendMessage = (text: string, attachments: Attachment[], options?: { steering?: boolean }) => {
    if (!text.trim() && attachments.length === 0) return;

    if (isGenerating) {
      if (options?.steering) {
        if (generationTimeoutRef.current) {
          clearTimeout(generationTimeoutRef.current);
          generationTimeoutRef.current = null;
        }
        setIsGenerating(false);
        setTimeout(() => executeSendMessage(text, attachments), 0);
        return;
      } else {
        setMessageQueue(prev => [...prev, {
          id: `queue-${Date.now()}`,
          text,
          attachments
        }]);
        return;
      }
    }

    executeSendMessage(text, attachments);
  };

  // Git actions
  const handleGitAction = (actionType: string, file?: string) => {
    const matchesTarget = (changeFile: string, targetPath: string) => {
      return changeFile === targetPath || changeFile.startsWith(targetPath.endsWith('/') ? targetPath : `${targetPath}/`);
    };

    if (actionType === 'revert') {
      setGitChanges(prev => prev.filter(c => !(file ? matchesTarget(c.file, file) : true)));
    } else if (actionType === 'revert_all') {
      setGitChanges(prev => prev.filter(c => c.staged));
    } else if (actionType === 'stage') {
      setGitChanges(prev => prev.map(c => (!file || matchesTarget(c.file, file)) ? { ...c, staged: true } : c));
    } else if (actionType === 'stage_all') {
      setGitChanges(prev => prev.map(c => ({ ...c, staged: true })));
    } else if (actionType === 'unstage') {
      setGitChanges(prev => prev.map(c => (!file || matchesTarget(c.file, file)) ? { ...c, staged: false } : c));
    } else if (actionType === 'unstage_all') {
      setGitChanges(prev => prev.map(c => ({ ...c, staged: false })));
    } else if (actionType === 'push') {
      setSyncCount(0);
    }
  };

  const handleCommit = (message: string) => {
    setGitChanges([]);
    setSyncCount(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-ink selection:text-canvas relative">
      
      {/* Mobile Top Visual Mode Indicator (helps user know which screen is shown and switch if desired) */}
      <div className="hidden sm:flex items-center justify-between px-3 py-1 bg-ink text-canvas text-[11px] z-50">
        <div className="flex items-center space-x-2">
          <span className="font-semibold">Mobile UI Preview</span>
          <span className="text-canvas/60">•</span>
          <span>Screen: {currentScreen === 'main' ? 'Gambar 1 (Main UI)' : currentScreen === 'session' ? 'Gambar 2 (Session Sidebar)' : 'Gambar 3 (Right Sidebar)'}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setCurrentScreen('main')}
            className={`px-2 py-0.5 rounded text-[10px] ${currentScreen === 'main' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'}`}
          >
            Gambar 1
          </button>
          <button
            type="button"
            onClick={() => setCurrentScreen('session')}
            className={`px-2 py-0.5 rounded text-[10px] ${currentScreen === 'session' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'}`}
          >
            Gambar 2
          </button>
          <button
            type="button"
            onClick={() => setCurrentScreen('right')}
            className={`px-2 py-0.5 rounded text-[10px] ${currentScreen === 'right' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'}`}
          >
            Gambar 3
          </button>
          {onDesktopToggle && (
            <button
              type="button"
              onClick={onDesktopToggle}
              className="ml-2 px-2 py-0.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-[10px]"
            >
              Desktop View
            </button>
          )}
        </div>
      </div>

      {/* Screen 1: Main UI (Gambar 1) */}
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
          appSettings={appSettings}
          messageQueue={messageQueue}
          setMessageQueue={setMessageQueue}
        />
      </div>

      {/* Screen 2: Session Sidebar (Gambar 2) */}
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

      {/* Screen 3: Right Sidebar / Git Changes (Gambar 3) */}
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

      {/* Fullscreen Mobile Editor when triggered via open-file event */}
      {mobileEditorFile && (
        <MobileFullEditor
          file={mobileEditorFile}
          onClose={() => setMobileEditorFile(null)}
        />
      )}

    </div>
  );
}
