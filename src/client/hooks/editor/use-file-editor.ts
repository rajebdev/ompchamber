import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getLanguageFromPath } from '@/shared/lib/code/syntax-highlight';

export type FileEditorSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** The single file a code surface is editing; `id` keys the in-memory cache. */
export interface FileEditorTarget {
  id?: number | string;
  name: string;
  path?: string;
  content?: string;
  root?: string;
  repo?: string;
}

export interface UseFileEditorOptions {
  /** Content substituted when a read fails (desktop). Omit to report the failure (mobile). */
  fallback?: (name: string) => string;
  /** Surface read failures through `loadError` instead of silently substituting `fallback`. */
  reportLoadError?: boolean;
  /** Flush a pending debounced write on unmount so closing the editor cannot drop an edit. */
  flushOnUnmount?: boolean;
  /** Mark a failed write as `'error'`; otherwise the status returns to `'idle'`. */
  reportSaveError?: boolean;
  /** Blob MIME type for downloads. */
  downloadMimeType?: string;
  /** Fired after a write lands, so workspace panels can refresh. */
  onFileSaved?: () => void;
}

export interface UseFileEditorResult {
  content: string;
  onChange: (next: string) => void;
  isLoading: boolean;
  loadError: string | null;
  saveStatus: FileEditorSaveStatus;
  copied: boolean;
  isDirty: boolean;
  language: string;
  saveNow: () => void;
  copy: () => void;
  download: () => void;
  /**
   * Re-read every cached file from disk (e.g. a workspace refresh). Content
   * already on screen stays until the fresh bytes land, and a file with
   * unsaved edits is left alone.
   */
  reset: () => void;
  /** Drop cached content for files no longer open. */
  retain: (ids: Array<number | string>) => void;
}

function targetKey(target: FileEditorTarget): string {
  return String(target.id ?? target.path ?? target.name);
}

/**
 * Owns the file-editing contract shared by the desktop editor and the phone's
 * full-screen editor: read, debounced FormData save, copy, download, dirty
 * tracking, and language resolution. Content is cached per file key so
 * switching tabs does not re-read a file whose edits are still in memory.
 */
export function useFileEditor(
  target: FileEditorTarget | null,
  options: UseFileEditorOptions = {},
): UseFileEditorResult {
  const {
    fallback,
    reportLoadError = false,
    flushOnUnmount = false,
    reportSaveError = false,
    downloadMimeType = 'text/plain',
    onFileSaved,
  } = options;

  const [contents, setContents] = useState<Record<string, string>>({});
  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<FileEditorSaveStatus>('idle');
  const [copied, setCopied] = useState(false);
  /** Bumped by `reset()` to re-run the read effect for the active file. */
  const [revision, setRevision] = useState(0);

  const key = target ? targetKey(target) : '';
  const content = target ? (contents[key] ?? target.content ?? '') : '';
  const isDirty = content !== (baselines[key] ?? content);

  // Keys whose read has been requested or served, so a re-render cannot fire a
  // duplicate fetch while the first one is still in flight.
  const loadedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<{ timer: number; file: FileEditorTarget; content: string } | null>(null);

  // Live mirrors of the content maps: a read response resolves long after it
  // was requested, and it has to know whether the buffer it read is still the
  // one on screen.
  const contentsRef = useRef(contents);
  contentsRef.current = contents;
  const baselinesRef = useRef(baselines);
  baselinesRef.current = baselines;

  const remember = useCallback((fileKey: string, text: string) => {
    setContents((prev) => ({ ...prev, [fileKey]: text }));
    setBaselines((prev) => ({ ...prev, [fileKey]: text }));
  }, []);

  const persist = useCallback(
    async (file: FileEditorTarget, text: string) => {
      if (!file.path) return;
      setSaveStatus('saving');
      const formData = new FormData();
      formData.append('actionType', 'save');
      formData.append('path', file.path);
      formData.append('content', text);
      if (file.root) formData.append('root', file.root);
      if (file.repo && file.repo !== '.') formData.append('repo', file.repo);
      try {
        const res = await fetch('/api/fs/action', { method: 'POST', body: formData });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setSaveStatus('saved');
          setBaselines((prev) => ({ ...prev, [targetKey(file)]: text }));
          onFileSaved?.();
        } else {
          setSaveStatus(reportSaveError ? 'error' : 'idle');
        }
      } catch {
        setSaveStatus(reportSaveError ? 'error' : 'idle');
      }
    },
    [onFileSaved, reportSaveError],
  );

  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Read the active file once per key. A cancelled guard keeps a late response
  // from a previous file from overwriting the one now on screen.
  useEffect(() => {
    if (!target) return;
    const fileKey = targetKey(target);
    if (loadedRef.current.has(fileKey)) return;
    loadedRef.current.add(fileKey);

    if (target.content !== undefined) {
      remember(fileKey, target.content);
      setLoadError(null);
      return;
    }

    if (!target.path) {
      if (reportLoadError) {
        setLoadError('No file path supplied for this attachment.');
        return;
      }
      remember(fileKey, fallback ? fallback(target.name) : '');
      return;
    }

    // Only a key with nothing on screen yet shows the loading state: a
    // re-read (refreshKey / reset) must not flash a spinner over live content.
    const firstLoad = contentsRef.current[fileKey] === undefined;
    let cancelled = false;
    if (firstLoad) setIsLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ path: target.path });
    if (target.root) params.set('root', target.root);
    if (target.repo && target.repo !== '.') params.set('repo', target.repo);
    fetch(`/api/fs/read?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (reportLoadError) {
          if (!res.ok || !data || typeof data.content !== 'string') {
            throw new Error((data as { error?: string } | null)?.error || `HTTP ${res.status}`);
          }
          return data.content as string;
        }
        return typeof data?.content === 'string' ? (data.content as string) : null;
      })
      .then((text) => {
        if (cancelled) return;
        // These bytes were read before the response arrived, so anything typed
        // since is newer. Applying them would replace those keystrokes (and,
        // once a refresh is triggered by a save, wipe the editor back to an
        // empty buffer) — instead let the queued write own the key.
        const typed = contentsRef.current[fileKey];
        if (typed !== undefined && typed !== baselinesRef.current[fileKey]) return;
        const queued = pendingRef.current;
        if (queued && targetKey(queued.file) === fileKey) return;
        remember(fileKey, text ?? (fallback ? fallback(target.name) : ''));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed re-read keeps what is on screen; only a first load reports.
        if (!firstLoad) return;
        if (reportLoadError) {
          remember(fileKey, '');
          setLoadError(err instanceof Error ? err.message : 'Failed to read file');
        } else {
          remember(fileKey, fallback ? fallback(target.name) : '');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, target, fallback, reportLoadError, remember, revision]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = window.setTimeout(() => setSaveStatus('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const onChange = useCallback(
    (next: string) => {
      if (!target) return;
      const fileKey = targetKey(target);
      setContents((prev) => ({ ...prev, [fileKey]: next }));
      if (!target.path) return;
      if (pendingRef.current) window.clearTimeout(pendingRef.current.timer);
      const timer = window.setTimeout(() => {
        pendingRef.current = null;
        void persistRef.current(target, next);
      }, 800);
      pendingRef.current = { timer, file: target, content: next };
    },
    [target],
  );

  const saveNow = useCallback(() => {
    if (!target) return;
    const text = contents[targetKey(target)];
    if (text === undefined) return;
    if (pendingRef.current) {
      window.clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
    void persistRef.current(target, text);
  }, [target, contents]);

  const copy = useCallback(() => {
    if (!target || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(contents[targetKey(target)] ?? '')
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, [target, contents]);

  const download = useCallback(() => {
    if (!target) return;
    const blob = new Blob([contents[targetKey(target)] ?? ''], { type: downloadMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = target.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [target, contents, downloadMimeType]);

  const reset = useCallback(() => {
    // Invalidate every key, then let the read effect refetch the active one.
    // Content is deliberately NOT cleared: it stays on screen until the fresh
    // bytes land, so a refresh can never blank the editor (or drop the file
    // that is open) while the request is in flight.
    loadedRef.current.clear();
    setRevision((prev) => prev + 1);
  }, []);

  const retain = useCallback((ids: Array<number | string>) => {
    const keep = new Set(ids.map(String));
    for (const loaded of Array.from(loadedRef.current)) {
      if (!keep.has(loaded)) loadedRef.current.delete(loaded);
    }
    setContents((prev) => {
      const keys = Object.keys(prev);
      if (keys.every((k) => keep.has(k))) return prev;
      const next: Record<string, string> = {};
      for (const k of keys) {
        if (keep.has(k)) next[k] = prev[k];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!flushOnUnmount) return;
    return () => {
      const pending = pendingRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingRef.current = null;
      void persistRef.current(pending.file, pending.content);
    };
  }, [flushOnUnmount]);

  return {
    content,
    onChange,
    isLoading,
    loadError,
    saveStatus,
    copied,
    isDirty,
    language: target ? getLanguageFromPath(target.name) : 'javascript',
    saveNow,
    copy,
    download,
    reset,
    retain,
  };
}
