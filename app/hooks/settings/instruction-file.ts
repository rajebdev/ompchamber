import { useCallback, useEffect, useState } from 'react';
import type { InstructionFileKind, InstructionFilePayload, InstructionSaveResult } from '@/types';

export interface InstructionFileState {
  content: string;
  /** Absolute native path, or null in MOCK mode where nothing hits disk. */
  filePath: string | null;
  exists: boolean;
  isMock: boolean;
  isLoading: boolean;
  error: string | null;
  save: (content: string) => Promise<InstructionSaveResult>;
  reset: () => Promise<InstructionSaveResult>;
}

/**
 * One native user instruction file (AGENTS.md / RULES.md) behind the Behavior
 * panel: loads the file when the panel mounts and persists edits back to it,
 * reporting either the failure or what else the save wrote.
 */
export function useInstructionFile(kind: InstructionFileKind): InstructionFileState {
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((data: InstructionFilePayload) => {
    if (typeof data.rules === 'string') setContent(data.rules);
    setFilePath(typeof data.path === 'string' ? data.path : null);
    setExists(data.exists === true);
    setIsMock(data.isMock === true);
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    fetch(`/api/settings/behavior?file=${kind}`)
      .then((res) => res.json() as Promise<InstructionFilePayload>)
      .then((data) => {
        if (!active) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        adopt(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adopt, kind]);

  const persist = useCallback(
    async (body: Record<string, unknown>): Promise<InstructionSaveResult> => {
      try {
        const res = await fetch('/api/settings/behavior', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, file: kind }),
        });
        const data = (await res.json()) as InstructionFilePayload;
        if (data.error) return { error: data.error };
        adopt(data);
        if (data.nativeError) return { note: `Saved, but the approval mapping was skipped: ${data.nativeError}` };
        if (data.nativeSynced) return { note: 'Saved — recognized permission gates were mirrored into config.yml tools.approval.' };
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    [adopt, kind],
  );

  return {
    content,
    filePath,
    exists,
    isMock,
    isLoading,
    error,
    save: (next: string) => persist({ rules: next }),
    reset: () => persist({ action: 'reset' }),
  };
}
