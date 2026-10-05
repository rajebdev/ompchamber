/**
 * Panel ids: the built-in right-panel views plus the panels plugin code
 * contributes.
 *
 * A plugin panel's id is `plugin:<pluginId>/<panelId>` — one string the layout
 * stores, keys widths by, and resolves a view from. Keeping it a plain string
 * rather than a second union member is what lets the activity bar, the mobile
 * tab bar and the width map handle a plugin without each learning about it.
 */

import { RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';

/** Prefix every plugin-contributed panel id carries. */
export const PLUGIN_PANEL_PREFIX = 'plugin:';

/** `plugin:<pluginId>/<panelId>` from a plugin's manifest and its panel entry. */
export function pluginPanelKey(pluginId: string, panelId: string): string {
  return `${PLUGIN_PANEL_PREFIX}${pluginId}/${panelId}`;
}

/**
 * The id a plugin panel is addressed by, or null when `value` is not one.
 *
 * Both segments must be non-empty: `plugin:` and `plugin:hello/` are the shapes
 * a truncated write or a half-typed value produces, and accepting either would
 * key a width map and a view lookup on an id no registry can ever report.
 */
export function pluginKeyOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(PLUGIN_PANEL_PREFIX)) return null;
  const rest = value.slice(PLUGIN_PANEL_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  return value;
}

/**
 * Whether a stored `layout.activeRightPanel` may be adopted on load.
 *
 * A plugin panel is accepted on the shape of its id alone: the registry is a
 * network read, so requiring the panel to be present would drop a perfectly
 * valid selection every time the server is slower than the first paint. A
 * panel that has since been uninstalled renders its own "not installed" notice
 * rather than falling back silently to Files.
 */
export function isPanelId(value: unknown): value is string {
  return (RIGHT_PANEL_TYPES as readonly string[]).includes(value as string) || pluginKeyOf(value) !== null;
}

export type { RightPanelType };
