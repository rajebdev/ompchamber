/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wiring the UI kit to the chamber's own services.
 *
 * `@ompchamber/ui` is a published package, so it cannot import the chamber's
 * source. This module is the host half of that seam: it hands the kit the few
 * services a plugin genuinely cannot reach itself, and it is called ONCE at
 * boot, before any plugin component can mount.
 *
 * Every service here is something a plugin could not do on its own:
 *
 * - the per-session store lives in a module singleton with its own persistence
 *   and eviction, so a plugin reading `localStorage` would get a different
 *   answer that survives the wrong things;
 * - the palette id is written by the theme hook and announced by an event, so a
 *   plugin cannot observe it from CSS alone;
 * - the active workspace is resolved from the session's project, not from the
 *   URL.
 */

import { configureUiKit } from '@ompchamber/ui';
import { getSessionValue, setSessionKey } from '@/shared/lib/workspace/session-state/store';
import { subscribeSessionKey } from '@/shared/lib/workspace/session-state/listeners';
import { pluginContext, subscribePluginContext } from '@/client/lib/plugins/context';

/**
 * Read a text file inside the active workspace, through the chamber's own fs
 * route.
 *
 * The route takes a root-relative path and enforces the browse scope, so a
 * plugin cannot name a file outside the workspace it was given — the check is
 * the server's, not a string test here.
 */
async function readWorkspaceFile(workspacePath: string | null, relativePath: string): Promise<string> {
  if (!workspacePath) throw new Error('No workspace folder is active.');
  const query = new URLSearchParams({ path: relativePath, root: workspacePath });
  const response = await fetch(`/api/fs/raw?${query}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Could not read ${relativePath} (${response.status})`);
  }
  return response.text();
}

/** Install the kit's services. Idempotent. */
export function installUiKit(): void {
  configureUiKit({
    context: pluginContext,
    subscribe: subscribePluginContext,
    getSessionValue: (sessionId, key) => {
      const stored = getSessionValue<unknown>(sessionId, `plugin.${key}`);
      return typeof stored === 'string' ? stored : null;
    },
    setSessionValue: (sessionId, key, value) => setSessionKey(sessionId, `plugin.${key}`, value),
    // The store's own per-slot bus, so a plugin's write reaches every OTHER
    // component reading that slot — a note field and a readout of its length are
    // two readers of one value, and without this the readout keeps whatever it
    // read at mount.
    subscribeSessionValue: (sessionId, key, listener) =>
      subscribeSessionKey(sessionId, `plugin.${key}`, listener),
    readWorkspaceFile,
  });
}
