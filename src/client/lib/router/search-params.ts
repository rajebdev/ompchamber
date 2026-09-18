import { useCallback, useSyncExternalStore } from 'preact/compat';

/**
 * `useSearchParams` replacement. The app's only routing state is `?sessionId=`
 * (plus `?folderId=`), so this is a subscription over `location.search` with the
 * same `[params, setParams]` tuple the Remix hook returned — including the
 * functional-updater form, so call sites keep working unchanged.
 *
 * The search string lives in ONE module-level store, not per-component state:
 * Remix shared router state across every mounted component, so a `setParams`
 * call from the sidebar must re-render `App` and the chat timeline too. With
 * per-component `useState` only the caller re-rendered and the rest of the tree
 * kept reading the stale value (selecting a session updated the URL but left
 * "No session selected" on screen).
 */

type SetParamsInit = URLSearchParams | Record<string, string> | string;
type SetParamsFn = (prev: URLSearchParams) => URLSearchParams;
type SetParams = (next: SetParamsInit | SetParamsFn, options?: { replace?: boolean }) => void;

const listeners = new Set<() => void>();
let currentSearch = typeof window === 'undefined' ? '' : window.location.search;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read `location.search` and notify only when it actually changed. */
function syncFromLocation(): void {
  const next = typeof window === 'undefined' ? '' : window.location.search;
  if (next === currentSearch) return;
  currentSearch = next;
  emit();
}

if (typeof window !== 'undefined') {
  // Back/forward navigation. `pushState`/`replaceState` do NOT fire popstate,
  // so setParams notifies directly.
  window.addEventListener('popstate', syncFromLocation);
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

function getSnapshot(): string {
  return currentSearch;
}

export function useSearchParams(): [URLSearchParams, SetParams] {
  // Preact's `useSyncExternalStore` takes only (subscribe, getSnapshot) — no
  // server-snapshot argument — and the app is client-rendered, so `currentSearch`
  // is the single source of truth.
  const search = useSyncExternalStore(subscribe, getSnapshot);

  const setParams = useCallback<SetParams>((next, options) => {
    const searchString = resolveNext(next, new URLSearchParams(currentSearch));
    const url = `${window.location.pathname}${searchString}${window.location.hash}`;
    if (options?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    currentSearch = searchString;
    emit();
  }, []);

  return [new URLSearchParams(search), setParams];
}
