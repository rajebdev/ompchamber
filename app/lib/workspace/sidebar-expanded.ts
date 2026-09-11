/**
 * Persistence for the sidebar's expanded-session rows.
 *
 * This is cross-session UI state (which session rows show their live subagent
 * roster), so it lives in localStorage rather than per-session session state.
 * Stored as a JSON array of session-id strings, newest insertion last; the
 * save path caps the array so it cannot grow without bound.
 */

const STORAGE_KEY = 'omp_sidebar_expanded_sessions';
/** Beyond this many ids the oldest are dropped on save. */
const MAX_IDS = 50;

export function loadExpandedSessionIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveExpandedSessionIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-MAX_IDS)));
  } catch {
    // Private mode / quota failures must never break the sidebar: expansion
    // persistence is best-effort.
  }
}
