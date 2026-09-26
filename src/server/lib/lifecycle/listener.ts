/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The HTTP listener this process is serving on.
 *
 * Two consumers need it and neither can import it: the shell renderer, which
 * asks the listener for its own `/_shell` route (Bun renders an HTML route only
 * while serving), and the dev asset proxy, which asks it for the assets Bun's
 * own routing table owns. The reference is injected rather than imported because
 * `index.ts` owns the listener and imports both of them — a direct import would
 * be a cycle.
 */

type Listener = { url: URL } | null;

let listener: Listener = null;

/** Called by the server entry once its listener is up. */
export function setListener(server: { url: URL }): void {
  listener = server;
}

/** The listener's base URL, or null before it is up. */
export function listenerUrl(): URL | null {
  return listener?.url ?? null;
}
