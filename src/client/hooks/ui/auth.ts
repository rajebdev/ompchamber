/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side UI-auth state, and the one place a 401 is noticed.
 *
 * The app has 128 `fetch` call sites across 65 files and no shared HTTP client,
 * so a gate that each caller had to honour would be a gate most callers forget.
 * Instead `installAuthFetchBridge` wraps `window.fetch` once at boot and watches
 * the responses that already flow through it: a 401 from this origin's `/api/`
 * means the session is gone, and the store flips to `required`. Every surface
 * then disappears behind the login screen without any of them knowing auth
 * exists.
 *
 * The bootstrap decides the initial state. The server only injects
 * `appSettings` for an authenticated request, so it already knows the answer —
 * asking again with `/api/auth/state` on every load would be a round trip to
 * learn something the page was told.
 *
 * This is not a security boundary and does not pretend to be: the server refuses
 * every request regardless. It only decides what the user sees.
 */

import { useCallback, useSyncExternalStore } from 'preact/compat';

export type AuthState = 'authenticated' | 'required';

/** Paths where a 401 is the answer to a question, not a lost session. */
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/state'];

let state: AuthState = 'authenticated';
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AuthState): void {
  if (state === next) return;
  state = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

/** Seed from the server-rendered bootstrap. Called once, before the first render. */
export function primeAuthState(authenticated: boolean | undefined): void {
  state = authenticated === false ? 'required' : 'authenticated';
}

/** Mark the session as gone — called by the fetch bridge and by a failed check. */
export function markAuthRequired(): void {
  setState('required');
}

/** Mark the session as present — called after a successful login. */
export function markAuthenticated(): void {
  setState('authenticated');
}

/** Current state without subscribing. */
export function currentAuthState(): AuthState {
  return state;
}

/** Subscribe to the auth state. */
export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Whether this URL is one whose 401 means "the session ended".
 *
 * Only same-origin `/api/` requests qualify. A cross-origin 401 belongs to
 * whoever answered it, and the auth endpoints answer 401 to a wrong password,
 * which is a state the login screen already renders.
 */
function isSessionBearingUrl(input: RequestInfo | URL): boolean {
  let raw: string;
  if (typeof input === 'string') raw = input;
  else if (input instanceof URL) raw = input.toString();
  else raw = input.url;

  let path: string;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    path = url.pathname;
  } catch {
    return false;
  }
  if (!path.startsWith('/api/')) return false;
  return !AUTH_ENDPOINTS.some((endpoint) => path === endpoint);
}

let bridgeInstalled = false;

/**
 * Wrap `window.fetch` so a 401 flips the store. Installed once; a second call is
 * a no-op, so a hot reload cannot stack wrappers.
 *
 * The response is inspected but never consumed — the body is handed to the
 * caller untouched, so a streaming response (SSE, a file read) is unaffected.
 */
export function installAuthFetchBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const patched = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const response = await nativeFetch(input, init);
    if (response.status === 401 && isSessionBearingUrl(input)) markAuthRequired();
    return response;
  };
  // Bun types `window.fetch` as the DOM function intersected with its own
  // (`preconnect`), which a wrapper cannot implement — hence the double
  // assertion. The call signature is preserved, which is what every caller uses.
  window.fetch = patched as unknown as typeof window.fetch;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  retryAfterSec?: number;
}

/**
 * Exchange a password for a session cookie.
 *
 * Navigates to `/` on success rather than just flipping the store: every mounted
 * hook fetched its data while unauthenticated (or holds nothing at all), and the
 * server only injects `appSettings` into an authenticated shell. A full load is
 * the one path that guarantees the app comes up with the settings and data a
 * session entitles it to, instead of patching them in piecemeal.
 *
 * `replace`, not `reload`: the login screen is reached at `/login`, and reloading
 * there would render the workspace at a URL that still says `/login`.
 */
export async function login(password: string, trustDevice: boolean): Promise<LoginResult> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, trustDevice }),
    });

    if (response.ok) {
      markAuthenticated();
      window.location.replace('/');
      return { ok: true };
    }

    const body = (await response.json().catch(() => null)) as { error?: string; retryAfter?: number } | null;
    return {
      ok: false,
      error: body?.error ?? (response.status === 429 ? 'Too many attempts' : 'Incorrect password'),
      retryAfterSec: typeof body?.retryAfter === 'number' ? body.retryAfter : undefined,
    };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

/** Clear the session cookie, then reload into the login screen. */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Even a failed request leaves the client with no usable session; the reload
    // below surfaces the real state.
  }
  markAuthRequired();
  window.location.reload();
}

/**
 * Re-check the session against the server.
 *
 * Used when the page was served by a build that does not inject the auth state,
 * and by the login screen's retry after a transport failure.
 */
export async function checkAuthState(): Promise<AuthState> {
  try {
    const response = await fetch('/api/auth/state', { headers: { accept: 'application/json' } });
    if (!response.ok) return state;
    const body = (await response.json()) as { authenticated?: boolean };
    const next = body.authenticated === false ? 'required' : 'authenticated';
    setState(next);
    return next;
  } catch {
    return state;
  }
}

/** Convenience hook for the login form. */
export function useAuthActions() {
  return {
    login: useCallback(login, []),
    logout: useCallback(logout, []),
    check: useCallback(checkAuthState, []),
  };
}
