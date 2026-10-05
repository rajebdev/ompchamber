/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Preact integration for a panel plugin: one provider, four hooks.
 *
 * A plugin used to hand-roll this — a context, a `ready` await, a theme handler,
 * a debounced session write — which meant every plugin re-derived the same two
 * behaviours that are easy to get wrong:
 *
 * - **The provider owns BOTH bridge subscriptions.** Registering `onTheme` from
 *   a component only fires if that component mounts; a panel whose components
 *   never called `useTheme()` silently stopped following the palette.
 * - **The context arrives late.** `workspacePath` and `sessionId` are resolved
 *   asynchronously by the chamber, so they are usually empty when `ready`
 *   settles. A component that captured `info` once would show "none" over a real
 *   workspace.
 *
 * Both are handled here so a plugin cannot get them wrong.
 */

import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { acquirePanel, type ChamberPanelApi, type PanelInfo } from '@ompchamber/plugin-sdk';

interface PanelContextValue {
  api: ChamberPanelApi;
  info: PanelInfo;
}

const PanelContext = createContext<PanelContextValue | null>(null);

function usePanelContext(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value) throw new Error('Panel hooks must be used inside <PanelProvider>');
  return value;
}

/**
 * The live panel info.
 *
 * Read through a hook rather than off the context directly so a component
 * re-renders when the workspace arrives.
 */
export function usePanelInfo(): PanelInfo {
  return usePanelContext().info;
}

/** The bridge itself, for `api.call(...)`. */
export function usePanelApi(): ChamberPanelApi {
  return usePanelContext().api;
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
 * The value lives in the session store, not in the frame: the frame is destroyed
 * whenever the panel is hidden, so local state would be lost on every tab
 * switch. Reads once on mount, writes debounced — `input` fires per keystroke,
 * and each one would otherwise be a postMessage round trip.
 */
export function useSessionValue(key: string, delayMs = 400): SessionValue {
  const api = usePanelApi();
  const [value, setValue] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api.call<string | null>('sessionState.get', { key }).then(
      (stored) => {
        if (cancelled) return;
        setValue(stored ?? '');
        setStatus('idle');
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, key]);

  useEffect(() => {
    if (value === null || status !== 'saving') return;
    const timer = setTimeout(async () => {
      try {
        await api.call('sessionState.set', { key, value });
        setStatus('saved');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [api, key, value, status, delayMs]);

  return {
    value,
    status,
    error,
    update: (next: string) => {
      setValue(next);
      setStatus('saving');
    },
  };
}

/**
 * Mount a panel, rendering `children` once the host has answered.
 *
 * Renders nothing until `ready` resolves: the panel has no data to draw before
 * then, and a half-drawn first frame is worse than none.
 */
export function PanelProvider({ children }: { children: ComponentChildren }) {
  const [value, setValue] = useState<PanelContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let api: ChamberPanelApi;
    try {
      api = acquirePanel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    /** Apply a palette id to the document, which is what `:root[data-theme]` keys off. */
    const applyTheme = (theme: string) => document.documentElement.setAttribute('data-theme', theme);

    api.ready.then(
      (info) => {
        if (cancelled) return;
        applyTheme(info.theme);
        api.onTheme = (theme) => {
          applyTheme(theme);
          setValue((current) => (current ? { ...current, info: { ...current.info, theme } } : current));
        };
        api.onContext = (next) => {
          if (next.theme) applyTheme(next.theme);
          setValue((current) => (current ? { ...current, info: { ...current.info, ...next } } : current));
        };
        setValue({ api, info });
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );

    return () => {
      cancelled = true;
      api.onTheme = undefined;
      api.onContext = undefined;
    };
  }, []);

  if (error) return <p class="oc-note oc-note-error">Could not attach to the chamber: {error}</p>;
  if (!value) return null;
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}
