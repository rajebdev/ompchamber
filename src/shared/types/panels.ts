/**
 * Panel-plugin contribution types.
 *
 * A panel plugin is third-party code the chamber loads into an isolated iframe
 * and shows as a right-panel or editor-panel view. The shape deliberately
 * mirrors VS Code's `contributes.views` + webview model: the manifest is DATA
 * (declared in the plugin's `ompchamber.json`), the code only ever runs inside
 * a sandboxed frame, and every privileged read goes through a capability-gated
 * postMessage bridge rather than through the chamber's own fetch.
 */

/** Where a contributed panel renders. Two slots, one manifest. */
export type PanelPosition = 'right' | 'editor';

/**
 * What a panel may ask the host for. Each value is one method group on the
 * bridge; a panel that declares none gets only the lifecycle handshake.
 */
export type PanelCapability =
  | 'theme'
  | 'session-state'
  | 'workspace-read';

export const PANEL_CAPABILITIES: readonly PanelCapability[] = ['theme', 'session-state', 'workspace-read'];

/** One panel a plugin declares. */
export interface PanelContribution {
  /** Unique within the plugin. The UI id is `plugin:<pluginId>/<panelId>`. */
  id: string;
  title: string;
  position: PanelPosition;
  /** HTML entry, relative to the plugin root. Served through the asset route. */
  entry: string;
  /** Optional icon file, relative to the plugin root. */
  icon?: string;
  /** Floor before the panel's content clips. Falls back to the slot default. */
  minWidth?: number;
  /** Share of the group's area the panel opens at. Falls back to the slot default. */
  defaultFraction?: number;
  /** Capability groups the host bridge will answer. */
  capabilities: PanelCapability[];
}

/** A plugin's own manifest file (`ompchamber.json` at its root). */
export interface PanelPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  panels: PanelContribution[];
}

/**
 * One plugin a marketplace catalog lists.
 *
 * `source` is a path RELATIVE to the marketplace root — the same convention
 * omp's own `marketplace.json` uses, so a catalog written for omp reads the
 * same way here. It is resolved under the root and may not escape it.
 */
export interface PanelMarketplacePluginEntry {
  name: string;
  source: string;
  description?: string;
  version?: string;
  category?: string;
}

/**
 * A local marketplace: `marketplace.json` at its root, plugin directories under
 * `plugins/`.
 *
 * The catalog is the curated view — it carries descriptions, ordering and
 * categories — but it is not the install list: a plugin directory present under
 * `plugins/` and absent from the catalog is still loaded, because "drop a folder
 * in" has to keep working. The catalog adds metadata; the directory is what
 * makes a plugin exist.
 */
export interface PanelMarketplaceManifest {
  name?: string;
  description?: string;
  owner?: { name?: string };
  plugins?: PanelMarketplacePluginEntry[];
}

/** A marketplace as the client sees it: no filesystem paths. */
export interface PanelMarketplaceItem {
  id: string;
  name: string;
  description?: string;
  /** Panels this marketplace contributed. */
  panelCount: number;
  /** Catalog entries that could not be resolved, with their reason. */
  errors: PanelPluginError[];
}

/**
 * One panel, flattened with the plugin that owns it — what the client renders
 * its activity-bar entry from, and what the host uses to build an asset URL.
 *
 * Deliberately carries no filesystem path: the plugin's directory is a
 * server-side detail the asset route resolves from the registry itself, and
 * sending it to the browser would publish the user's home directory layout to
 * every frame for no consumer.
 */
export interface PanelRegistryEntry extends PanelContribution {
  /** `plugin:<manifest.id>/<panel.id>` — the id the layout stores and keys on. */
  panelKey: string;
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  /** The marketplace that supplied it. */
  marketplace: string;
}

/**
 * Why a plugin directory was skipped, so the UI can report it instead of hiding it.
 *
 * `marketplace` is filled in by the scan so the pane can group a rejection under
 * the marketplace it came from. Deriving that in the UI would mean matching on
 * the path, which breaks the moment two marketplaces share a directory name.
 */
export interface PanelPluginError {
  dir: string;
  reason: string;
  marketplace?: string;
}

/**
 * One installed plugin's build state.
 *
 * A plugin is a Bun package, so its panels are served from a BUILD output
 * (`dist/`) rather than from its sources. A plugin whose build has not run —
 * freshly cloned, or a build that failed — therefore has a valid manifest and no
 * servable entry, and that is a different condition from a rejected manifest:
 * the pane offers a Rebuild for it instead of reporting it as broken.
 */
export interface PanelPluginStatus {
  pluginId: string;
  name: string;
  /** True when the entry file its manifest names exists on disk. */
  built: boolean;
  /** Why the last build did not produce the entry, when it did not. */
  reason?: string;
  /** Whether the plugin is a Bun package (has a package.json). */
  isPackage: boolean;
}

export interface PanelRegistryPayload {
  panels: PanelRegistryEntry[];
  marketplaces: PanelMarketplaceItem[];
  errors: PanelPluginError[];
  /** Build state per installed plugin. */
  plugins: PanelPluginStatus[];
}
