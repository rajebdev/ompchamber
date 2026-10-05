/**
 * The panel host: one sandboxed frame, one postMessage channel.
 *
 * The iframe is `sandbox="allow-scripts"` WITHOUT `allow-same-origin`, which
 * gives the frame an opaque origin. That single omission is the whole isolation
 * story — verified in the browser: inside the frame `location.origin` is the
 * string `"null"`, and reading `parent.document.body` or `localStorage` throws
 * `SecurityError`. It is not process isolation (a web app cannot have that), so
 * the capability bridge is what bounds what the plugin can still ask for.
 *
 * The document is the plugin's OWN entry HTML, served by the asset route with
 * the SDK and a CSP injected into its head. Loading it as the frame's `src`
 * (not `srcdoc`) is what makes the plugin's relative URLs work: the route's URL
 * is a real base, so `./main.js` and `../shared/x.css` resolve to that plugin's
 * files without the plugin knowing anything about the chamber.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PanelRegistryEntry } from '@/shared/types';
import { panelAssetBase } from '@/shared/lib/panels/asset-base';
import { handlePanelCall } from '@/client/lib/panels/bridge';
import type { PanelToHostMessage } from '@/shared/lib/panels/protocol';

interface PanelHostProps {
  panel: PanelRegistryEntry;
  /** False while the panel is hidden; a hidden frame is not mounted at all. */
  active: boolean;
  sessionId: string | null;
  workspacePath: string | null;
  /** The live palette id, forwarded so the plugin can match the chamber's theme. */
  theme: string;
  className?: string;
}

export function PanelHost({ panel, active, sessionId, workspacePath, theme, className = '' }: PanelHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  /** The session context the frame was last seeded with, as one comparable key. */
  const contextKey = `${sessionId ?? ''}\u0000${workspacePath ?? ''}`;
  const seededContextRef = useRef<string | null>(null);

  const postToFrame = useCallback((message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  /**
   * Everything the frame is seeded with, built in one place.
   *
   * The handshake sends this as `init` and a later change re-sends it as
   * `context`; two literals would be the obvious way for the two to drift, and a
   * field missing from the second send is invisible until a panel renders it.
   */
  const contextMessage = useCallback(
    (type: 'init' | 'context') => ({
      __ompchamber: type,
      assetBase: panelAssetBase(panel.panelKey),
      panelKey: panel.panelKey,
      title: panel.title,
      theme,
      capabilities: panel.capabilities,
      sessionId,
      workspacePath,
    }),
    [panel, theme, sessionId, workspacePath],
  );

  // A different panel means a different document: the frame must not keep the
  // previous plugin's loaded state, and `ready` must not stay true across the
  // swap or the first theme delta would reach the new frame before its init.
  useEffect(() => {
    setReady(false);
    seededContextRef.current = null;
  }, [panel.panelKey]);

  useEffect(() => {
    if (!active) return;
    const onMessage = (event: MessageEvent) => {
      // Compared against the frame's own window, not `event.origin`: an opaque
      // origin reports the string "null", so origin alone cannot tell this
      // frame from any other sandboxed frame on the page.
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as PanelToHostMessage | null;
      if (!data || typeof data !== 'object') return;

      if (data.__ompchamber === 'ready') {
        setReady(true);
        // Remembered so the re-seed effect below can tell "the handshake already
        // carried this" from "this changed since".
        seededContextRef.current = contextKey;
        postToFrame(contextMessage('init'));
        return;
      }

      if (data.__ompchamber === 'call' && typeof data.id === 'number' && typeof data.method === 'string') {
        const id = data.id;
        handlePanelCall({ panel, sessionId, workspacePath }, data.method, data.params).then(
          (value) => postToFrame({ __ompchamber: 'result', id, ok: true, value }),
          (reason: unknown) =>
            postToFrame({
              __ompchamber: 'result',
              id,
              ok: false,
              error: reason instanceof Error ? reason.message : String(reason),
            }),
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active, contextKey, contextMessage, postToFrame]);

  // Seeded once; later theme writes are deltas, so a theme switch does not
  // reload the plugin's document and throw its state away.
  useEffect(() => {
    if (ready) postToFrame({ __ompchamber: 'theme', theme });
  }, [theme, ready, postToFrame]);

  /**
   * Re-seed the frame when the session's context changes.
   *
   * `init` goes out on the handshake, but the workspace path and the session id
   * are resolved ASYNCHRONOUSLY by the layout — the session list and the route
   * are read after the panel has mounted. A frame seeded with `null` therefore
   * keeps `null` for its whole life, and a panel that shows the workspace shows
   * "none" over a real one. Measured: the same panel reported the workspace
   * correctly on one visit and `none` on the next, depending on which arrived
   * first.
   */
  useEffect(() => {
    if (!ready) return;
    // The handshake's `init` already carried exactly this; re-sending it would
    // be a no-op the frame cannot distinguish from a real change.
    if (seededContextRef.current === contextKey) return;
    seededContextRef.current = contextKey;
    postToFrame(contextMessage('context'));
  }, [ready, contextKey, contextMessage, postToFrame]);

  if (!active) return null;

  return (
    <iframe
      ref={frameRef}
      title={panel.title}
      // `allow-scripts` WITHOUT `allow-same-origin`: the frame gets an opaque
      // origin, so it cannot touch the chamber's DOM, storage or API.
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      src={`${panelAssetBase(panel.panelKey)}${panel.entry}`}
      className={`border-0 bg-canvas ${className || 'w-full h-full'}`}
    />
  );
}
