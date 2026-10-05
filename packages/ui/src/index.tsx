/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The UI kit a plugin renders with, and the host services it reads through.
 *
 * Everything here runs IN THE HOST'S TREE — same Preact instance, same
 * document, same theme — so the kit is plain Preact components, not a
 * message-passing client. What it still must not do is reach into the host's
 * own source: this is a published package, so the host INJECTS its services
 * once at boot via `configureUiKit`, and the hooks read them.
 *
 * Two rules the hooks exist to enforce, because a plugin gets them wrong:
 *
 * - **Context arrives late.** The active session and workspace are resolved
 *   asynchronously, so a component that captured them once would show "none"
 *   over a real workspace. Every hook subscribes and re-renders.
 * - **Session state is not component state.** The component is unmounted when
 *   its panel is hidden, so a value kept in `useState` alone would be lost on
 *   every tab switch. `useSessionValue` reads the chamber's store.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** What the host seeds every plugin component with. */
export interface PanelContext {
  sessionId: string | null;
  workspacePath: string | null;
  theme: string;
}

/**
 * The host's own services, injected once.
 *
 * Deliberately narrow: each field is something a plugin genuinely cannot do
 * itself (read the chamber's per-session store, know the live palette, resolve
 * the active workspace). Anything a plugin could read from the DOM it should.
 */
export interface UiKitServices {
  /** The current panel context. */
  context(): PanelContext;
  /** Subscribe to context changes (a new session, a palette switch). */
  subscribe(listener: (context: PanelContext) => void): () => void;
  /** Read one per-session value. */
  getSessionValue(sessionId: string | null, key: string): string | null;
  /** Write one per-session value. */
  setSessionValue(sessionId: string | null, key: string, value: string): void;
  /**
   * Subscribe to writes of ONE per-session value, from any component.
   *
   * Optional so a host built before this seam still runs a newer kit — the
   * hook degrades to read-on-mount, which is what every host did.
   *
   * It exists because `getSessionValue` alone makes two readers of one key
   * disagree: a component reads the store once and then holds its own copy, so
   * a field that WRITES a value and a readout that DISPLAYS it are two private
   * copies of the same fact, and the readout keeps the value it read at mount
   * forever. That is not a stale pixel — it is the plugin's own UI contradicting
   * itself, which is exactly what the bundled example does (a note field and a
   * character count of that note).
   */
  subscribeSessionValue?(sessionId: string | null, key: string, listener: () => void): () => void;
  /** Read a text file inside the active workspace. Rejects with the reason. */
  readWorkspaceFile(workspacePath: string | null, relativePath: string): Promise<string>;
}

let services: UiKitServices | null = null;

/** Called ONCE by the host at boot. A plugin must never call this. */
export function configureUiKit(next: UiKitServices): void {
  services = next;
}

function requireServices(): UiKitServices {
  if (!services) {
    throw new Error(
      'The OMPChamber UI kit has no host services — this component must be rendered by the OMPChamber app.',
    );
  }
  return services;
}

/**
 * The live panel context, re-rendering on every change.
 *
 * `useState` is seeded from the service and updated by its subscription, which
 * is what makes a workspace that arrives after the first paint show up.
 */
export function usePanelInfo(): PanelContext {
  const [context, setContext] = useState<PanelContext>(() => requireServices().context());

  useEffect(() => {
    const api = requireServices();
    setContext(api.context());
    return api.subscribe(setContext);
  }, []);

  return context;
}

/** The live palette id. */
export function useTheme(): string {
  return usePanelInfo().theme;
}

export interface SessionValue {
  /** `null` until the read answers — the field should be disabled, not empty. */
  value: string | null;
  status: 'loading' | 'idle' | 'saving' | 'saved' | 'error';
  error: string | null;
  update: (next: string) => void;
}

/**
 * Per-session state, as a `useState` that persists.
 *
 * The write is debounced: `onInput` fires per keystroke, and each one would
 * otherwise be a store write and a request.
 */
export function useSessionValue(key: string, delayMs = 400): SessionValue {
  const { sessionId } = usePanelInfo();
  const [value, setValue] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  // Distinguishes "this component's own edit" from "someone else wrote the
  // slot". Only the former may set `saving`, or an unrelated write would mark a
  // field dirty and write it straight back.
  const editing = useRef(false);

  const read = useCallback((): string => {
    try {
      const stored = requireServices().getSessionValue(sessionId, key) ?? '';
      setError(null);
      return stored;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
      return '';
    }
  }, [sessionId, key]);

  useEffect(() => {
    editing.current = false;
    setStatus('loading');
    setValue(read());
    setStatus((current) => (current === 'error' ? current : 'idle'));
  }, [read]);

  // Follow writes from anywhere else — the header readout showing a note's
  // length, a second view of the same value. Skipped while THIS component is
  // mid-edit, because its own state is the newer truth until the debounce
  // lands.
  useEffect(() => {
    const api = requireServices();
    if (!api.subscribeSessionValue) return;
    return api.subscribeSessionValue(sessionId, key, () => {
      if (editing.current) return;
      setValue(read());
    });
  }, [sessionId, key, read]);

  useEffect(() => {
    if (value === null || status !== 'saving') return;
    const timer = setTimeout(() => {
      try {
        requireServices().setSessionValue(sessionId, key, value);
        editing.current = false;
        setStatus('saved');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [sessionId, key, value, status, delayMs]);

  const update = useCallback((next: string) => {
    editing.current = true;
    setValue(next);
    setStatus('saving');
  }, []);

  return { value, status, error, update };
}

export interface WorkspaceFile {
  content: string | null;
  loading: boolean;
  error: string | null;
}

/** Read one text file inside the active workspace. */
export function useWorkspaceFile(relativePath: string): WorkspaceFile {
  const { workspacePath } = usePanelInfo();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    requireServices()
      .readWorkspaceFile(workspacePath, relativePath)
      .then(
        (text) => {
          if (cancelled) return;
          setContent(text);
          setLoading(false);
        },
        (cause: unknown) => {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setLoading(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [workspacePath, relativePath]);

  return { content, loading, error };
}
