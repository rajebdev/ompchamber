import { useCallback } from 'react';

export interface OpenFilePayload {
  path: string;
  name?: string;
  id?: number;
  content?: string;
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
        content: payload.content
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
