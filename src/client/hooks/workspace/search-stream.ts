import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { SearchResultItem } from '@/shared/types/fs';

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
 * incrementally with `response.body.getReader()`. A new `start` call aborts
 * the previous run — matching the fetcher semantics the panel relied on.
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

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      const consumeFrame = (frame: string) => {
        const eventLine = frame.split('\n').find(l => l.startsWith('event: '));
        const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
        if (!eventLine || !dataLine) return;
        try {
          const data = JSON.parse(dataLine.slice('data: '.length));
          if (eventLine.slice('event: '.length) === 'matches' && Array.isArray(data)) {
            setResults(prev => [...prev, ...data]);
          }
        } catch {
          // Malformed frame — skip; the next frame carries its own payload.
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        frames.forEach(consumeFrame);
      }
      if (buffer) consumeFrame(buffer);
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
