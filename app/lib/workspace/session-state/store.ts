/**
 * Per-session UI state store (module singleton).
 *
 * UI state that should survive session switches (and full page reloads) is
 * kept here in an in-memory cache keyed by the session id and persisted as
 * one JSON blob per session into the `session_ui_state` SQLite table via
 * `GET/POST /api/sessions/:sessionId/state`. Session ids are the URL
 * `sessionId` param values: numeric in mock mode, omp UUID strings in real
 * mode, plus transient `new-…` ids for pending chats (migrated to the real
 * id on spawn adoption).
 *
 * Key namespace contract (dot-prefixed by owning panel):
 * - layout.activeRightPanel   RightPanelType
 * - layout.showRightPanel     boolean
 * - layout.openedFiles        editor file entries array
 * - layout.activeFileId       number | null
 * - editor.previewMode        Record<fileId, boolean>
 * - editor.wordWrap           boolean
 * - editor.zoomLevel          number
 * - files.expandedPaths       string[]
 * - files.searchQuery         string
 * - files.activeRepo          string
 * - browser.viewportMode      string
 * - browser.zoomLevel         number
 * - userBrowser.history       string[]
 * - userBrowser.historyIndex  number
 * - userBrowser.inputUrl      string
 * - userBrowser.viewportMode  string
 * - userBrowser.zoomLevel     number
 * - terminal.activeRepo       string
 * - terminal.cwd              string
 * - terminal.commandHistory   string[]
 * - terminal.input            string
 * - terminal.output           string (trimmed tail)
 * - git.viewMode              'flat' | 'tree'
 * - git.commitDraft           string
 * - git.stagedExpanded        boolean
 * - git.unstagedExpanded      boolean
 * - git.expandedFolders       string[]
 * - git.repoQuery             string
 * - search.query              string
 * - search.replaceQuery       string
 * - search.matchCase          boolean
 * - search.wholeWord          boolean
 * - search.useRegex           boolean
 * - search.includeFiles       string
 * - search.showIncludeField   boolean
 * - search.activeRepo         string
 * - context.rawExpandedIds    Record<string, boolean>
 * - context.rawFilterRole     'all' | 'assistant' | 'user'
 * - usage.selectedProviderId  'kenari' | 'deepseek'
 * - chat.draft                string
 * - chat.draftAttachments     attachment metadata array
 */

type SessionState = Record<string, unknown>;

const cache = new Map<string, SessionState>();
const readySessions = new Set<string>();
const dirtySessions = new Map<string, boolean>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

const PERSIST_DEBOUNCE_MS = 600;

export function getSessionValue<T>(sessionId: string | null, key: string): T | undefined {
  if (!sessionId) return undefined;
  return cache.get(sessionId)?.[key] as T | undefined;
}

export function setSessionKey(sessionId: string | null, key: string, value: unknown): void {
  if (!sessionId) return;
  const state = cache.get(sessionId) ?? {};
  state[key] = value;
  cache.set(sessionId, state);
  dirtySessions.set(sessionId, true);
  schedulePersist(sessionId);
}

function schedulePersist(sessionId: string): void {
  const existing = persistTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    sessionId,
    setTimeout(() => {
      persistTimers.delete(sessionId);
      void persistSession(sessionId);
    }, PERSIST_DEBOUNCE_MS),
  );
}

async function persistSession(sessionId: string): Promise<void> {
  if (typeof window === 'undefined' || !sessionId) return;
  if (!dirtySessions.get(sessionId)) return;
  dirtySessions.set(sessionId, false);
  const state = cache.get(sessionId) ?? {};
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch (err) {
    console.warn('session-state persist failed:', err);
    dirtySessions.set(sessionId, true);
  }
}

/** Immediately persist any pending writes for a session (used on switch). */
export function flushSession(sessionId: string | null): Promise<void> {
  if (!sessionId || typeof window === 'undefined') return Promise.resolve();
  const timer = persistTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    persistTimers.delete(sessionId);
  }
  return persistSession(sessionId);
}

/** Fetch a session's stored blob and merge it under any local writes. */
export async function loadSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  if (typeof window === 'undefined') {
    readySessions.add(sessionId);
    return;
  }
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`);
    if (res.ok) {
      const data = (await res.json()) as { state?: SessionState };
      const incoming = data.state && typeof data.state === 'object' ? data.state : {};
      const existing = cache.get(sessionId) ?? {};
      // Writes made while the fetch was in flight win over the stored blob.
      cache.set(sessionId, { ...incoming, ...existing });
    }
  } catch (err) {
    console.warn('session-state load failed:', err);
  }
  readySessions.add(sessionId);
}

/** Seed the cache synchronously (e.g. from SSR-provided data). */
export function hydrateSession(sessionId: string | null, state: SessionState): void {
  if (!sessionId) return;
  cache.set(sessionId, { ...(cache.get(sessionId) ?? {}), ...state });
  readySessions.add(sessionId);
}

/** Mark a session as loaded without fetching (fresh / ephemeral sessions). */
export function markSessionReady(sessionId: string | null): void {
  if (sessionId) readySessions.add(sessionId);
}

/**
 * Move a pending `new-…` session's state onto the real session id adopted
 * by a spawn, then discard the transient slot.
 */
export function migrateSessionState(fromId: string, toId: string): void {
  const from = cache.get(fromId);
  if (from) cache.set(toId, { ...from, ...(cache.get(toId) ?? {}) });
  readySessions.add(toId);
  dirtySessions.set(toId, true);
  schedulePersist(toId);
  cache.delete(fromId);
  readySessions.delete(fromId);
  dirtySessions.delete(fromId);
}
