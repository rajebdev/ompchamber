import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { WorkspaceFolderData } from '@/types';
import { MobileMainView } from '@/components/mobile/MainView';
import { MobileSessionSidebar } from '@/components/mobile/SessionSidebar';
import { MobileRightSidebar } from '@/components/mobile/RightSidebar';
import { MobileFullEditor } from '@/components/mobile/mobile-right-sidebar/FullEditor';
import { MobileScreenSwitcher } from '@/components/mobile/ScreenSwitcher';
import { activeProjectForSession } from '@/lib/workspace/active-project';
import { useMobileChatSession } from '@/hooks/chat/mobile-session';

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

  const { folder: sessionFolder } = activeProjectForSession(folders, sessionId);
  const contextFolder = sessionFolder ?? (folderId ? folders.find(f => String(f.id) === String(folderId)) ?? null : null);
  const activeProjectPath = contextFolder?.project_path ?? null;
  const hasContext = !!contextFolder;

  const {
    messages,
    setMessages,
    sessionModel,
    isGenerating,
    messageQueue,
    setMessageQueue,
    handleSendMessage,
    handleStopGenerating,
  } = useMobileChatSession({ folders, sessionId, selectedFolderId, appSettings });

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
          sessionModel={sessionModel}
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
