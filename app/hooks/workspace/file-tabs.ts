import { useEffect, useRef, useCallback } from 'react';
import { useSessionState } from '@/hooks/workspace/session-state';
import { useSessionStateContext } from '@/hooks/workspace/session-state/context';
import type { OpenedFile } from '@/types/fs';

export function useFileTabs(
  activeProjectPath: string | null,
  sessionId: string,
  onOpenTab?: () => void
) {
  const [openedFiles, setOpenedFiles] = useSessionState<OpenedFile[]>('layout.openedFiles', []);
  const [activeFileId, setActiveFileId] = useSessionState<number | string | null>('layout.activeFileId', null);

  const activeRootRef = useRef<string | null | undefined>(undefined);
  const { ready: layoutReady } = useSessionStateContext();
  const wipedRootRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (activeRootRef.current === activeProjectPath) return;
    activeRootRef.current = activeProjectPath;
    if (!layoutReady || wipedRootRef.current === activeProjectPath) return;
    wipedRootRef.current = activeProjectPath;
    setOpenedFiles([]);
    setActiveFileId(null);
  }, [activeProjectPath, sessionId, layoutReady, setOpenedFiles, setActiveFileId]);

  const handleOpenFile = useCallback((file: any) => {
    const fileEntry: OpenedFile = {
      ...file,
      root: file.root ?? activeProjectPath ?? undefined,
    };
    setOpenedFiles(prev => {
      const existing = prev.find(
        f => f.id === fileEntry.id || (!f.isDiff && f.path && fileEntry.path && f.path === fileEntry.path)
      );
      if (existing) {
        setActiveFileId(existing.id);
        return prev;
      }
      return [...prev, fileEntry];
    });
    setActiveFileId(fileEntry.id);
    onOpenTab?.();
  }, [activeProjectPath, onOpenTab, setOpenedFiles, setActiveFileId]);

  const handleOpenDiff = useCallback((diffInfo: {
    file: string;
    staged?: boolean;
    status?: string;
    repo?: string;
    root?: string;
  }) => {
    const rawPath = diffInfo.file.replace(/^\/+/, '');
    const fileName = rawPath.split('/').pop() || rawPath;
    const isStaged = Boolean(diffInfo.staged);
    const diffId = `diff-${isStaged ? 'staged' : 'working'}-${rawPath}`;

    const diffEntry: OpenedFile = {
      id: diffId,
      name: `${fileName} (Diff)`,
      path: rawPath,
      isDiff: true,
      diffStatus: diffInfo.status || 'M',
      diffStaged: isStaged,
      repo: diffInfo.repo || '.',
      root: diffInfo.root ?? activeProjectPath ?? undefined,
    };

    setOpenedFiles(prev => {
      const existing = prev.find(
        f => f.id === diffId || (f.isDiff && f.path === rawPath && f.diffStaged === isStaged)
      );
      if (existing) {
        setActiveFileId(existing.id);
        return prev;
      }
      return [...prev, diffEntry];
    });
    setActiveFileId(diffId);
    onOpenTab?.();
  }, [activeProjectPath, onOpenTab, setOpenedFiles, setActiveFileId]);

  const handleCloseFile = useCallback((id: number | string) => {
    setOpenedFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeFileId, setOpenedFiles, setActiveFileId]);

  // Global listeners for omp:open-file and omp:open-diff
  useEffect(() => {
    const handleCustomOpenFile = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name?: string; id?: number; content?: string }>;
      if (!customEvent.detail || !customEvent.detail.path) return;

      const rawPath = customEvent.detail.path.replace(/^\/+/, '');
      const name = customEvent.detail.name || rawPath.split('/').pop() || 'file';
      let hash = 0;
      for (let i = 0; i < rawPath.length; i++) {
        hash = (hash << 5) - hash + rawPath.charCodeAt(i);
        hash |= 0;
      }
      const id = customEvent.detail.id || Math.abs(hash) || Date.now();

      handleOpenFile({
        id,
        name,
        path: rawPath,
        content: customEvent.detail.content,
      });
    };

    const handleCustomOpenDiff = (e: Event) => {
      const customEvent = e as CustomEvent<{
        file: string;
        staged?: boolean;
        status?: string;
        repo?: string;
        root?: string;
      }>;
      if (!customEvent.detail || !customEvent.detail.file) return;
      handleOpenDiff(customEvent.detail);
    };

    window.addEventListener('omp:open-file', handleCustomOpenFile);
    window.addEventListener('omp:open-diff', handleCustomOpenDiff);
    return () => {
      window.removeEventListener('omp:open-file', handleCustomOpenFile);
      window.removeEventListener('omp:open-diff', handleCustomOpenDiff);
    };
  }, [handleOpenFile, handleOpenDiff]);

  return {
    openedFiles,
    activeFileId,
    setActiveFileId,
    handleOpenFile,
    handleOpenDiff,
    handleCloseFile,
  };
}
