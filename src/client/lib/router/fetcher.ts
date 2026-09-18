import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * `useFetcher` replacement backed by plain `fetch`.
 *
 * The seven call sites use four members — `data`, `state`, `load(url)`, and
 * `submit(body, {method, action})` — so this hook reproduces exactly those
 * semantics: `state` is `'idle' | 'loading' | 'submitting'`, and every settled
 * request writes its parsed JSON into `data`. `submit` accepts the same plain
 * object and `FormData` bodies Remix accepted.
 *
 * Every new request aborts the previous one. Panels poll on a 2s cadence
 * (`usePanelRefresh`) and the search box re-submits as you type, so without
 * this each superseded request kept its socket open until the browser's
 * per-host connection limit (6 in Chrome) was exhausted — after that every
 * request, including unrelated ones, stalled forever.
 */

export type FetcherState = 'idle' | 'loading' | 'submitting';

export interface FetcherLike<T> {
  data: T | undefined;
  state: FetcherState;
  load: (url: string) => Promise<void>;
  submit: (body: FormData | Record<string, unknown>, options: { method?: string; action: string }) => Promise<void>;
}

function encodeBody(body: FormData | Record<string, unknown>): BodyInit {
  if (body instanceof FormData) return body;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function useFetcher<T = unknown>(): FetcherLike<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [state, setState] = useState<FetcherState>('idle');
  const aliveRef = useRef(true);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const run = useCallback(async (url: string, init: RequestInit, phase: FetcherState) => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setState(phase);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const parsed = await readJson(response);
      if (aliveRef.current && inFlightRef.current === controller) setData(parsed as T);
    } catch {
      // An aborted request is superseded by a newer one; leave `data` alone so
      // the panel keeps showing the last good result instead of blanking.
    } finally {
      if (aliveRef.current && inFlightRef.current === controller) {
        inFlightRef.current = null;
        setState('idle');
      }
    }
  }, []);

  const load = useCallback((url: string) => run(url, { method: 'GET' }, 'loading'), [run]);

  const submit = useCallback(
    (body: FormData | Record<string, unknown>, options: { method?: string; action: string }) =>
      run(
        options.action,
        {
          method: (options.method ?? 'POST').toUpperCase(),
          body: encodeBody(body),
          headers: body instanceof FormData ? undefined : { 'content-type': 'application/x-www-form-urlencoded' },
        },
        'submitting',
      ),
    [run],
  );

  return { data, state, load, submit };
}
