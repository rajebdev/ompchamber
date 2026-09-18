import { useCallback, useState } from 'preact/hooks';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { normalizeUrl } from '@/shared/lib/browser/url';

interface UseUserBrowserResult {
  /** URL currently loaded in the frame ('' when nothing was opened yet). */
  url: string;
  /** Address-bar text; persisted per session. */
  input: string;
  setInput: (value: string) => void;
  /** Bumped to force the frame to reload the same URL. */
  frameKey: number;
  loading: boolean;
  error?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  submit: (raw: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  markLoaded: () => void;
}

const HISTORY_KEY = 'userBrowser.history';
const HISTORY_INDEX_KEY = 'userBrowser.historyIndex';
const INPUT_KEY = 'userBrowser.inputUrl';

/**
 * Address bar + navigation history for the user's iframe browser.
 *
 * History is the list of addresses the user typed (in-page navigations inside a
 * cross-origin frame are not observable), which is exactly what back/forward
 * need to feel right. Persisted per session so a panel reopen restores the page.
 */
export function useUserBrowser(): UseUserBrowserResult {
  const [history, setHistory] = useSessionState<string[]>(HISTORY_KEY, []);
  const [historyIndex, setHistoryIndex] = useSessionState<number>(HISTORY_INDEX_KEY, -1);
  const [input, setInput] = useSessionState<string>(INPUT_KEY, '');
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const url = historyIndex >= 0 && historyIndex < history.length ? history[historyIndex] ?? '' : '';

  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      let next: string;
      try {
        next = normalizeUrl(trimmed);
      } catch (normalizeError) {
        setError(normalizeError instanceof Error ? normalizeError.message : 'Alamat tidak valid');
        return;
      }
      setError(undefined);
      setLoading(true);
      const truncated = history.slice(0, historyIndex + 1);
      const nextHistory = [...truncated, next];
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      setInput(next);
      setFrameKey((key) => key + 1);
    },
    [history, historyIndex, setHistory, setHistoryIndex, setInput],
  );

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    setLoading(true);
    setHistoryIndex(historyIndex - 1);
  }, [historyIndex, setHistoryIndex]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    setLoading(true);
    setHistoryIndex(historyIndex + 1);
  }, [history.length, historyIndex, setHistoryIndex]);

  const reload = useCallback(() => {
    if (!url) return;
    setLoading(true);
    setFrameKey((key) => key + 1);
  }, [url]);

  const markLoaded = useCallback(() => {
    setLoading(false);
  }, []);

  return {
    url,
    input,
    setInput,
    frameKey,
    loading,
    error,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex >= 0 && historyIndex < history.length - 1,
    submit,
    goBack,
    goForward,
    reload,
    markLoaded,
  };
}
