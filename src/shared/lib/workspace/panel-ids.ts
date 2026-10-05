/**
 * Panel ids: the built-in right-panel views plus the panels plugin code
 * contributes.
 *
 * A plugin panel's id is `plugin:<pluginId>` — one string the layout stores,
 * keys widths by, and resolves a component from. Keeping it a plain string
 * rather than a second union member is what lets the activity bar, the mobile
 * tab bar and the width map handle a plugin without each learning about it.
 *
 * There is no panel-id segment because a plugin contributes AT MOST ONE panel
 * per slot: the layout gives it one activity-bar button and one editor tab, so
 * a second id could never be reached.
 */

import { RIGHT_PANEL_TYPES, type RightPanelType } from '@/shared/lib/workspace/right-panels';

/** Prefix every plugin-contributed panel id carries. */
export const PLUGIN_PANEL_PREFIX = 'plugin:';

/** `plugin:<pluginId>` for a plugin's contributed panel. */
export function pluginPanelKey(pluginId: string): string {
  return `${PLUGIN_PANEL_PREFIX}${pluginId}`;
}

/**
 * The plugin id a panel id names, or null when `value` is not one.
 *
 * The segment must be non-empty: `plugin:` is the shape a truncated write or a
 * half-typed value produces, and accepting it would key a width map and a
 * component lookup on an id no registry can ever report.
 */
export function pluginKeyOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(PLUGIN_PANEL_PREFIX)) return null;
  const rest = value.slice(PLUGIN_PANEL_PREFIX.length);
  if (!rest || rest.includes('/')) return null;
  return value;
}

/** The plugin id inside a panel id, or null. */
export function pluginIdOf(value: unknown): string | null {
  const key = pluginKeyOf(value);
  return key ? key.slice(PLUGIN_PANEL_PREFIX.length) : null;
}

/**
 * Whether a stored `layout.activeRightPanel` may be adopted on load.
 *
 * A plugin panel is accepted on the shape of its id alone: the registry is a
 * network read and the slots exist only after a bundle has been imported, so
 * requiring the panel to be present would drop a perfectly valid selection
 * every time the server is slower than the first paint. A panel whose plugin
 * has since been uninstalled renders its own "not installed" notice rather than
 * falling back silently to Files.
 */
export function isPanelId(value: unknown): value is string {
  return (RIGHT_PANEL_TYPES as readonly string[]).includes(value as string) || pluginKeyOf(value) !== null;
}

export type { RightPanelType };
