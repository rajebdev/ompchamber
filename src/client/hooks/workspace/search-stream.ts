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
 */
export function useSearchStream(): SearchStreamState & {
  start: (body: Record<string, string>) => Promise<void>;
} {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);

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

    setResults([]);
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
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) setResults(prev => [...prev, ...parsed]);
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

  return { results, isSearching, start };
}
