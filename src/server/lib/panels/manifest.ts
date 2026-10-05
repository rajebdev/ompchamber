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
 */

import type {
  PanelCapability,
  PanelContribution,
  PanelMarketplaceManifest,
  PanelMarketplacePluginEntry,
  PanelPluginManifest,
  PanelPosition,
} from '@/shared/types';
import { PANEL_CAPABILITIES } from '@/shared/types';
import { isRecord } from '@/shared/lib/util/guards';
import { resolveInsideRoot } from '@/shared/lib/panels/resolve-asset';

/** An id segment: what a plugin or panel id may look like. */
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toCapabilities(value: unknown): PanelCapability[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: PanelCapability[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(PANEL_CAPABILITIES as readonly string[]).includes(item)) return null;
    if (!out.includes(item as PanelCapability)) out.push(item as PanelCapability);
  }
  return out;
}

/**
 * Validate one panel entry.
 *
 * `entry` and `icon` become filesystem reads on the asset route, so both must
 * resolve inside the plugin root — an absolute path or a `../` segment would
 * turn one plugin's manifest into a read of any file the server can open.
 * Refused here rather than at the route because a manifest naming an escaping
 * path is not a panel, and rejecting it at scan time is what makes the refusal
 * visible in the UI.
 */
export function toContribution(raw: unknown, root: string): PanelContribution | { error: string } {
  if (!isRecord(raw)) return { error: 'panel entry is not an object' };
  const id = trimmed(raw.id);
  const title = trimmed(raw.title);
  const entry = trimmed(raw.entry);
  const position: PanelPosition | null =
    raw.position === 'right' || raw.position === 'editor' || raw.position === 'header' ? raw.position : null;
  if (!id || !ID_RE.test(id)) return { error: `panel id ${JSON.stringify(raw.id)} is missing or invalid` };
  if (!title) return { error: `panel "${id}" has no title` };
  if (!position) return { error: `panel "${id}" position must be "right", "editor" or "header"` };
  if (!entry) return { error: `panel "${id}" has no entry` };
  if (!resolveInsideRoot(root, entry)) return { error: `panel "${id}" entry "${entry}" escapes the plugin directory` };
  const capabilities = toCapabilities(raw.capabilities);
  if (!capabilities) return { error: `panel "${id}" declares an unknown capability` };
  const icon = trimmed(raw.icon);
  if (icon && !resolveInsideRoot(root, icon)) return { error: `panel "${id}" icon "${icon}" escapes the plugin directory` };
  const minWidth = typeof raw.minWidth === 'number' && raw.minWidth > 0 ? raw.minWidth : undefined;
  const defaultFraction =
    typeof raw.defaultFraction === 'number' && raw.defaultFraction > 0 ? raw.defaultFraction : undefined;

  return {
    id,
    title,
    position,
    entry,
    ...(icon ? { icon } : {}),
    ...(minWidth ? { minWidth } : {}),
    ...(defaultFraction ? { defaultFraction } : {}),
    capabilities,
  };
}

/** Parse a plugin manifest body. Returns the reason it is unusable, or the manifest. */
export function toManifest(raw: unknown, root: string): PanelPluginManifest | { error: string } {
  if (!isRecord(raw)) return { error: 'manifest is not an object' };
  const id = trimmed(raw.id);
  const name = trimmed(raw.name);
  const version = trimmed(raw.version);
  if (!id || !ID_RE.test(id)) return { error: `manifest id ${JSON.stringify(raw.id)} is missing or invalid` };
  if (!name) return { error: 'manifest has no name' };
  if (!version) return { error: 'manifest has no version' };
  if (!Array.isArray(raw.panels) || raw.panels.length === 0) return { error: 'manifest declares no panels' };

  const panels: PanelContribution[] = [];
  // One panel per position, enforced rather than documented. The layout gives
  // each plugin exactly one activity-bar button, one navbar button and one
  // editor tab, so a second `right` panel would be unreachable — and a second
  // `header` panel would leave the dropdown with two candidates for what to
  // open. Refusing at scan time is what makes that visible instead of silent.
  const positions = new Set<PanelPosition>();
  for (const item of raw.panels) {
    const panel = toContribution(item, root);
    if ('error' in panel) return { error: panel.error };
    if (positions.has(panel.position)) {
      return { error: `plugin "${id}" declares more than one "${panel.position}" panel` };
    }
    positions.add(panel.position);
    panels.push(panel);
  }
  return { id, name, version, description: trimmed(raw.description), homepage: trimmed(raw.homepage), panels };
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
