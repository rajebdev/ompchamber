/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `POST /api/panels/install` — install a panel plugin, remove one, or switch
 * one on or off.
 *
 * Every verb answers with the WHOLE panel payload rather than just a status: a
 * mutation changes the catalog, the panel list, the rejections and the
 * enablement state at once, and a caller that had to re-read would be able to
 * show a state the server never had.
 *
 * `install` takes EITHER a `url` (a git clone) or a `pluginId` from the bundled
 * marketplace (a copy of the plugin the package ships). Both converge on one
 * staged install, so a bundled plugin and a cloned one are indistinguishable
 * afterwards — same directory shape, same catalog entry, same build step.
 *
 * `enable`/`disable` only flip a flag: the plugin's files stay on disk, which is
 * what makes disabling reversible and different from `remove`.
 */

import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { discoverPanelPlugins, invalidatePanelScan } from '@/server/lib/panels/registry.server';
import { installPanelPluginFromBundled, installPanelPluginFromGit, removePanelPlugin } from '@/server/lib/panels/install.server';
import { setPluginEnabled } from '@/server/lib/panels/state.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed({ request, params: {} });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const type = typeof body.type === 'string' ? body.type : '';

  if (type === 'install') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const pluginId = typeof body.pluginId === 'string' ? body.pluginId.trim() : '';
    if (!url && !pluginId) return json({ error: 'A git URL or a bundled plugin id is required.' }, { status: 400 });

    const result = url ? await installPanelPluginFromGit(url) : await installPanelPluginFromBundled(pluginId);
    // A partial success (installed on disk, catalog entry failed) still answers
    // 200 with the whole payload — the plugin IS there, and the payload's own
    // errors list carries what went wrong with the catalog.
    if (!result.ok) return json({ error: result.error, ...(await discoverPanelPlugins()) }, { status: 400 });
    return json({ ok: true, pluginId: result.pluginId, ...(await discoverPanelPlugins()) });
  }

  if (type === 'remove') {
    const pluginId = typeof body.pluginId === 'string' ? body.pluginId.trim() : '';
    if (!pluginId) return json({ error: 'A plugin id is required.' }, { status: 400 });
    const result = await removePanelPlugin(pluginId);
    // A removed plugin's disabled flag would otherwise outlive it and switch off
    // a future reinstall of the same id.
    if (result.ok) await setPluginEnabled(pluginId, true);
    if (!result.ok) return json({ error: result.error, ...(await discoverPanelPlugins()) }, { status: 400 });
    return json({ ok: true, ...(await discoverPanelPlugins()) });
  }

  if (type === 'enable' || type === 'disable') {
    const pluginId = typeof body.pluginId === 'string' ? body.pluginId.trim() : '';
    if (!pluginId) return json({ error: 'A plugin id is required.' }, { status: 400 });
    await setPluginEnabled(pluginId, type === 'enable');
    // The scan publishes a plugin's panels only while it is on, so the cached
    // scan is stale the moment the flag moves.
    invalidatePanelScan();
    return json({ ok: true, ...(await discoverPanelPlugins()) });
  }

  return json({ error: `Unknown action: ${type || '(none)'}` }, { status: 400 });
}
