import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { SettingsCategoryId } from '@/types';
import { MobileMainView } from '@/components/mobile/MainView';
import { MobileSessionSidebar } from '@/components/mobile/SessionSidebar';
import { MobileRightSidebar } from '@/components/mobile/RightSidebar';
import { MobileFullEditor } from '@/components/mobile/mobile-right-sidebar/FullEditor';
import { MobileFullDiff } from '@/components/mobile/mobile-right-sidebar/FullDiff';
import { SettingsModal } from '@/components/settings/Modal';
import { activeProjectForSession } from '@/lib/workspace/active-project';
import { triggerSessionPrewarm, spawnCwdForNewSession } from '@/lib/omp/session/prewarm';
import { useSidebarData } from '@/hooks/chat/omp/session-list';

interface MobileLayoutWrapperProps {
  onDesktopToggle?: () => void;
  appSettings?: Record<string, any>;
}

export type MobileScreen = 'main' | 'session' | 'right';

export function MobileLayoutWrapper({ onDesktopToggle, appSettings = {} }: MobileLayoutWrapperProps) {
  const { folders } = useSidebarData();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId');
  const sessionId = sessionParam ? (Number.isNaN(Number(sessionParam)) ? sessionParam : Number(sessionParam)) : null;
  const folderParam = searchParams.get('folderId');
  const folderId = folderParam ? (Number.isNaN(Number(folderParam)) ? folderParam : Number(folderParam)) : null;

  const [currentScreen, setCurrentScreen] = useState<MobileScreen>('main');
  const [mobileEditorFile, setMobileEditorFile] = useState<{ name: string; path?: string; content?: string; root?: string } | null>(null);
  const [mobileDiff, setMobileDiff] = useState<{ path: string; status?: string; staged?: boolean; repo?: string; root?: string } | null>(null);
  // Bumped whenever a write lands so the workspace panels (explorer, git,
  // context) re-read from disk — the same signal the desktop layout passes down.
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('appearance');
  const [autoOpenAddProvider, setAutoOpenAddProvider] = useState(false);

  const handleWorkspaceChanged = useCallback(() => setRefreshKey(k => k + 1), []);

  const { folder: sessionFolder } = activeProjectForSession(folders, sessionId);
  const contextFolder = sessionFolder ?? (folderId ? folders.find(f => String(f.id) === String(folderId)) ?? null : null);
  const activeProjectPath = contextFolder?.project_path ?? null;
  const hasContext = !!contextFolder;

  // Listen to open-file event on mobile
  useEffect(() => {
    const handleCustomOpenFile = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name?: string; content?: string; root?: string }>;
      if (!customEvent.detail || !customEvent.detail.path) return;
      const rawPath = customEvent.detail.path.replace(/^\/+/, '');
      const name = customEvent.detail.name || rawPath.split('/').pop() || 'file';
      setMobileEditorFile({
        name,
        path: rawPath,
        content: customEvent.detail.content,
        root: customEvent.detail.root,
      });
    };

    window.addEventListener('omp:open-file', handleCustomOpenFile);
    return () => window.removeEventListener('omp:open-file', handleCustomOpenFile);
  }, []);

  // The git panel and the file explorer announce a diff through
  // `omp:open-diff`, which the desktop layout turns into an editor tab. On the
  // phone the same event opens the full-screen diff; without a listener here
  // the tap was silently dropped.
  useEffect(() => {
    const handleCustomOpenDiff = (e: Event) => {
      const detail = (e as CustomEvent<{ file?: string; status?: string; staged?: boolean; repo?: string; root?: string }>).detail;
      if (!detail?.file) return;
      setMobileDiff({
        path: detail.file.replace(/^\/+/, ''),
        status: detail.status,
        staged: detail.staged,
        repo: detail.repo,
        root: detail.root ?? activeProjectPath ?? undefined,
      });
    };

    window.addEventListener('omp:open-diff', handleCustomOpenDiff);
    return () => window.removeEventListener('omp:open-diff', handleCustomOpenDiff);
  }, [activeProjectPath]);

  // Settings requests (e.g. the model dropdown asking for Settings → Providers
  // when no provider is configured) arrive on the same global channel the
  // desktop layout listens on. SettingsModal itself only reads the payload and
  // never opens, so the open has to be handled here.
  useEffect(() => {
    const handleCustomOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent<{ category?: SettingsCategoryId; autoOpenAdd?: boolean }>).detail;
      setSettingsCategory(detail?.category ?? 'appearance');
      setAutoOpenAddProvider(Boolean(detail?.autoOpenAdd));
      setSettingsOpen(true);
    };

    window.addEventListener('omp:open-settings', handleCustomOpenSettings);
    return () => window.removeEventListener('omp:open-settings', handleCustomOpenSettings);
  }, []);

  const handleSelectSession = (id: number | string) => {
    setSearchParams(prev => {
      prev.set('sessionId', id.toString());
      // Navigating away from a session must also exit its transcript view.
      if (prev.has('subagent')) prev.delete('subagent');
      return prev;
    }, { replace: true });
    setCurrentScreen('main');
  };

  // Mirrors the desktop sidebar: a client-side pending session (`new-…`) that
  // the chat timeline replaces with the real omp session id on first send.
  // The current folder stays selected so the composer keeps its context.
  const handleNewSession = () => {
    // Same resolution the send path uses (active session's folder, else the
    // URL folderId) so the prewarmed cwd matches the eventual spawn cwd.
    const cwd = spawnCwdForNewSession(folders, sessionParam, folderId ?? undefined);
    if (cwd) triggerSessionPrewarm(cwd);
    setSearchParams(prev => {
      const currentSessionId = prev.get('sessionId');
      const next = new URLSearchParams(prev);
      next.set('sessionId', `new-${Date.now()}`);
      if (currentSessionId) {
        const currentFolder = folders.find(f =>
          f.sessions?.some((s) => String(s.id) === String(currentSessionId))
        );
        if (currentFolder) next.set('folderId', currentFolder.id.toString());
      }
      return next;
    }, { replace: true });
    setCurrentScreen('main');
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
    <div
      className="flex flex-col h-dvh w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-ink selection:text-canvas relative"
    >
      <div className={`flex-1 min-h-0 w-full ${currentScreen === 'main' ? 'block' : 'hidden'}`}>
        <MobileMainView
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onOpenSessionSidebar={() => setCurrentScreen('session')}
          onOpenRightSidebar={() => setCurrentScreen('right')}
          appSettings={appSettings}
        />
      </div>

      <div className={`flex-1 min-h-0 w-full ${currentScreen === 'session' ? 'block' : 'hidden'}`}>
        <MobileSessionSidebar
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onCreateFolder={handleCreateFolder}
          onClose={() => setCurrentScreen('main')}
          onDesktopToggle={onDesktopToggle}
          appSettings={appSettings}
        />
      </div>

      {/* Mounted only while the drawer is open: its panels (explorer, git,
          terminal, context) cost real CPU and fetch real data — a hidden
          phone drawer must not keep them alive behind the chat screen. The
          session screen above stays mounted on purpose: its status-ack effect
          must run even while the drawer is closed, and its stream poll is
          already inert when nothing is running. */}
      {currentScreen === 'right' && (
        <div className="flex-1 min-h-0 w-full">
          <MobileRightSidebar
            enabled={hasContext}
            rootPath={activeProjectPath ?? undefined}
            refreshKey={refreshKey}
            onRefresh={handleWorkspaceChanged}
            onOpenFile={handleOpenFile}
            onClose={() => setCurrentScreen('main')}
          />
        </div>
      )}

      {mobileEditorFile && (
        <MobileFullEditor
          file={mobileEditorFile}
          onClose={() => setMobileEditorFile(null)}
          onFileSaved={handleWorkspaceChanged}
        />
      )}

      {mobileDiff && (
        <MobileFullDiff
          diff={mobileDiff}
          onClose={() => setMobileDiff(null)}
          onFileSaved={handleWorkspaceChanged}
        />
      )}

      {/* Single settings modal for the mobile layout, fed by omp:open-settings
          and by the sidebar's Settings button. */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setAutoOpenAddProvider(false);
        }}
        initialCategory={settingsCategory}
        autoOpenAddProvider={autoOpenAddProvider}
        appSettings={appSettings}
      />
    </div>
  );
}
