import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

/**
 * `useSearchParams` replacement. The app's only routing state is `?sessionId=`,
 * so this is a `popstate`/`pushState` subscription over `location.search` with
 * the same `[params, setParams]` tuple the Remix hook returned — including the
 * functional-updater form, so call sites keep working unchanged.
 */

type SetParamsInit = URLSearchParams | Record<string, string> | string;
type SetParamsFn = (prev: URLSearchParams) => URLSearchParams;
type SetParams = (next: SetParamsInit | SetParamsFn, options?: { replace?: boolean }) => void;

function readSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function toSearchString(init: SetParamsInit): string {
  if (typeof init === 'string') return init.startsWith('?') ? init : `?${init}`;
  if (init instanceof URLSearchParams) return init.toString() ? `?${init.toString()}` : '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(init)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString() ? `?${params.toString()}` : '';
}

function resolveNext(next: SetParamsInit | SetParamsFn, current: URLSearchParams): string {
  if (typeof next === 'function') return toSearchString(next(new URLSearchParams(current)));
  return toSearchString(next);
}

export function useSearchParams(defaultInit?: SetParamsInit): [URLSearchParams, SetParams] {
  const [search, setSearch] = useState<string>(() => readSearch() || (defaultInit ? toSearchString(defaultInit) : ''));

  useEffect(() => {
    const onPopState = () => setSearch(readSearch());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const params = useMemo(() => new URLSearchParams(search), [search]);

  const setParams = useCallback<SetParams>((next, options) => {
    const searchString = resolveNext(next, new URLSearchParams(readSearch()));
    const url = `${window.location.pathname}${searchString}${window.location.hash}`;
    if (options?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setSearch(searchString);
  }, []);

  return [params, setParams];
}
