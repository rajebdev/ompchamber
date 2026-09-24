import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { SearchResultItem } from '@/shared/types/fs';
import { readSseStream } from '@/shared/lib/chat/read-sse';

interface SearchStreamState {
  results: SearchResultItem[];
  isSearching: boolean;
}

/**
 * Streams `/api/fs/search` SSE results into state as they arrive, so the
 * panel paints file groups while ripgrep is still walking the tree instead
 * of waiting for the full run to finish.
 *
 * The POST body goes out as `application/x-www-form-urlencoded` (the same
 * encoding the old `useFetcher.submit` used) and the response is consumed
 * incrementally via the shared SSE reader. A new `start` call aborts the
 * previous run — matching the fetcher semantics the panel relied on.
 *
 * Results carry the `scope` they were searched under (the workspace root plus
 * the selected repo). A workspace switch therefore shows no hits at all rather
 * than the previous workspace's — a match's path is relative to the root it was
 * found under, so the same string names a different file, or none, here.
 */
export function useSearchStream(scope: string): SearchStreamState & {
  start: (body: Record<string, string>) => Promise<void>;
} {
  const [state, setState] = useState<{ scope: string; results: SearchResultItem[] }>({ scope, results: [] });
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const start = useCallback(async (body: Record<string, string>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requested = scopeRef.current;

    setState({ scope: requested, results: [] });
    setIsSearching(true);
    try {
      const response = await fetch('/api/fs/search', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        signal: controller.signal,
      });

      await readSseStream(
        response,
        (event, data) => {
          if (event !== 'matches') return;
          // A run superseded by a workspace switch is no longer this panel's.
          if (scopeRef.current !== requested) return;
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              setState(prev => prev.scope === requested
                ? { scope: requested, results: [...prev.results, ...parsed] }
                : prev);
            }
          } catch {
            // Malformed frame — skip; the next frame carries its own payload.
          }
        },
        controller.signal,
      );
    } catch {
      // Aborted (superseded or unmounted) — leave partial results rendered.
    } finally {
      if (aliveRef.current && abortRef.current === controller) {
        abortRef.current = null;
        setIsSearching(false);
      }
    }
  }, []);

  return {
    results: state.scope === scope ? state.results : [],
    // A run in flight for another scope is not searching THIS one.
    isSearching: isSearching && state.scope === scope,
    start,
  };
}
