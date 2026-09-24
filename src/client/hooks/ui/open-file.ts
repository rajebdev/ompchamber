import { useCallback } from 'preact/hooks';

export interface OpenFilePayload {
  path: string;
  name?: string;
  id?: number;
  content?: string;
  /** Absolute workspace root the path belongs to; the panel defaults it to the active project. */
  root?: string;
  /** Repo picked in the panel, relative to `root` — the path's own scope when set. */
  repo?: string;
}

/**
 * Dispatches an event to open a file in the workspace editor.
 */
export function openFileInEditor(payloadOrPath: string | OpenFilePayload) {
  if (typeof window === 'undefined') return;

  const payload: OpenFilePayload = typeof payloadOrPath === 'string'
    ? { path: payloadOrPath }
    : payloadOrPath;

  const cleanPath = payload.path.replace(/^\/+/, '');
  const fileName = payload.name || cleanPath.split('/').pop() || 'file';

  window.dispatchEvent(
    new CustomEvent('omp:open-file', {
      detail: {
        path: cleanPath,
        name: fileName,
        id: payload.id,
        content: payload.content,
        root: payload.root,
        repo: payload.repo,
      }
    })
  );
}

/**
 * Hook providing a convenient callback to open files in editor.
 */
export function useOpenFile() {
  return useCallback((payloadOrPath: string | OpenFilePayload) => {
    openFileInEditor(payloadOrPath);
  }, []);
}
