/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `POST /api/panels/install` — install a panel plugin from a git URL, or remove
 * one by id.
 *
 * Both verbs answer with the WHOLE panel payload rather than just a status: an
 * install changes the catalog, the panel list and the rejections at once, and a
 * caller that had to re-read would be able to show a state the server never had.
 *
 * The clone is delegated to `install.server.ts`, which stages it outside the
 * scan's glob so a failed clone never appears as a broken plugin.
 */

import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { discoverPanelPlugins } from '@/server/lib/panels/registry.server';
import { installPanelPluginFromGit, removePanelPlugin } from '@/server/lib/panels/install.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed({ request, params: {} });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const type = typeof body.type === 'string' ? body.type : '';
  const payload = await discoverPanelPlugins();

  if (type === 'install') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return json({ error: 'A git URL is required.' }, { status: 400 });
    const result = await installPanelPluginFromGit(url);
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
    if (!result.ok) return json({ error: result.error, ...payload }, { status: 400 });
    return json({ ok: true, ...(await discoverPanelPlugins()) });
  }

  return json({ error: `Unknown action: ${type || '(none)'}` }, { status: 400 });
}
