/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation for panel-plugin manifests and marketplace catalogs.
 *
 * Pure: every function takes an already-parsed JSON value and a root path, and
 * returns either a normalized value or the sentence explaining why it was
 * refused. Nothing here touches the filesystem, which is what makes the rules
 * testable without a fixture tree — and the rules are the part that matters,
 * because every one of them is a refusal that would otherwise be silent.
 *
 * A manifest no longer declares PANELS. A plugin's UI is what its bundle
 * registers when it loads, so the manifest carries only what the HOST needs
 * before the code runs: an identity, an icon, and the bundle to import. Slot
 * titles and positions come from the registration — which is also why the
 * server cannot list a plugin's panels and the client lists what loaded.
 */

import type {
  PanelMarketplaceManifest,
  PanelMarketplacePluginEntry,
  PanelPluginManifest,
} from '@/shared/types';
import { isRecord } from '@/shared/lib/util/guards';
import { resolveInsideRoot } from '@/shared/lib/panels/resolve-asset';

/** An id segment: what a plugin id may look like. */
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Parse a plugin manifest body.
 *
 * `app` names the BUILT bundle (`dist/app.js`), not a source file, and it must
 * resolve inside the plugin's own directory: the value becomes a filesystem
 * read on the asset route, so an absolute path or a `../` segment would turn
 * one plugin's manifest into a read of any file the server can open. `icon` is
 * held to the same rule for the same reason.
 */
export function toManifest(raw: unknown, root: string): PanelPluginManifest | { error: string } {
  if (!isRecord(raw)) return { error: 'manifest is not an object' };
  const id = trimmed(raw.id);
  const name = trimmed(raw.name);
  const version = trimmed(raw.version);
  const app = trimmed(raw.app);
  if (!id || !ID_RE.test(id)) return { error: `manifest id ${JSON.stringify(raw.id)} is missing or invalid` };
  if (!name) return { error: 'manifest has no name' };
  if (!version) return { error: 'manifest has no version' };
  if (!app) return { error: 'manifest has no "app" bundle' };
  if (!resolveInsideRoot(root, app)) return { error: `manifest app "${app}" escapes the plugin directory` };

  const icon = trimmed(raw.icon);
  if (icon && !resolveInsideRoot(root, icon)) {
    return { error: `manifest icon "${icon}" escapes the plugin directory` };
  }

  const readme = trimmed(raw.readme);
  if (readme && !resolveInsideRoot(root, readme)) {
    return { error: `manifest readme "${readme}" escapes the plugin directory` };
  }

  const branding = isRecord(raw.branding) ? trimmed(raw.branding.icon) : undefined;

  return {
    id,
    name,
    version,
    app,
    ...(trimmed(raw.description) ? { description: trimmed(raw.description) } : {}),
    ...(trimmed(raw.homepage) ? { homepage: trimmed(raw.homepage) } : {}),
    ...(icon ? { icon } : {}),
    ...(readme ? { readme } : {}),
    ...(branding ? { branding: { icon: branding } } : {}),
  };
}

/**
 * Parse a marketplace catalog.
 *
 * A catalog is optional metadata: its job is descriptions and grouping for
 * plugins that are found on disk anyway, so a catalog that is absent or has no
 * `plugins` array is a valid, empty catalog rather than an error. What is NOT
 * optional is a catalog entry's `source` — it is the key that binds an entry to
 * a directory, and an entry whose source escapes the marketplace root would let
 * the catalog point at anything.
 */
export function toMarketplaceCatalog(raw: unknown, root: string): PanelMarketplaceManifest | { error: string } {
  if (!isRecord(raw)) return { error: 'marketplace.json is not an object' };
  const entries: PanelMarketplacePluginEntry[] = [];
  const rawPlugins = raw.plugins;
  if (rawPlugins !== undefined) {
    if (!Array.isArray(rawPlugins)) return { error: 'marketplace.json "plugins" must be an array' };
    for (const item of rawPlugins) {
      if (!isRecord(item)) return { error: 'a marketplace plugin entry is not an object' };
      const name = trimmed(item.name);
      const source = trimmed(item.source);
      if (!name) return { error: 'a marketplace plugin entry has no name' };
      if (!source) return { error: `marketplace plugin "${name}" has no source` };
      if (!resolveInsideRoot(root, source)) {
        return { error: `marketplace plugin "${name}" source "${source}" escapes the marketplace directory` };
      }
      entries.push({
        name,
        source,
        description: trimmed(item.description),
        version: trimmed(item.version),
        category: trimmed(item.category),
      });
    }
  }
  const owner = isRecord(raw.owner) ? { name: trimmed(raw.owner.name) } : undefined;
  return {
    name: trimmed(raw.name),
    description: trimmed(raw.description),
    ...(owner ? { owner } : {}),
    plugins: entries,
  };
}
