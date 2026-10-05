/**
 * Panel-plugin contribution types.
 *
 * A panel plugin is third-party code the chamber loads INTO ITS OWN PAGE: the
 * bundle is a real ESM module, the host `import()`s it, and the components it
 * registers are rendered in the host's Preact tree — the same document, the
 * same theme, the same hooks. There is no iframe and no message channel, so a
 * plugin is local code, trusted the way a VS Code extension is trusted.
 *
 * The manifest therefore carries only what the host needs BEFORE the code runs:
 * an identity, an optional icon, and the bundle to import. Which panels exist,
 * their titles and their positions are decided by the registrations the bundle
 * makes when it loads.
 */

/** Where a contributed panel renders. One panel per position, per plugin. */
export type PanelPosition = 'right' | 'editor' | 'header';

/**
 * A plugin's own manifest (`ompchamber` in `package.json`, or a standalone
 * `ompchamber.json`).
 */
export interface PanelPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  /**
   * The built ESM bundle, relative to the plugin root — conventionally
   * `dist/app.js`. It is what the host `import()`s; the module's default export
   * must be a `definePluginApp(...)` definition.
   */
  app: string;
  /** Optional icon file, relative to the plugin root. */
  icon?: string;
  /**
   * Optional README, relative to the plugin root. Markdown, shown in the pane's
   * reader so a user can judge a plugin before installing it.
   *
   * When it is absent the scan looks for `README.md` at the plugin root, which
   * is the convention every package already follows — a plugin author should not
   * have to declare a file they already wrote.
   */
  readme?: string;
  /** Optional branding block; `icon` above is authoritative when both exist. */
  branding?: { icon?: string };
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
 * One installed plugin, as the client sees it.
 *
 * Deliberately carries no filesystem path: the plugin's directory is a
 * server-side detail the bundle route resolves from the registry itself, and
 * sending it to the browser would publish the user's home directory layout for
 * no consumer.
 */
export interface PanelRegistryEntry {
  pluginId: string;
  name: string;
  version: string;
  /** Absolute URL of the plugin's ESM bundle, content-addressed per build. */
  appUrl: string;
  /** Absolute URL of the plugin's icon, when it declares one. */
  iconUrl?: string;
  /** Absolute URL of the plugin's README, when it ships one. */
  readmeUrl?: string;
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
 * A plugin is a Bun package, so its UI is served from a BUILD output (`dist/`)
 * rather than from its sources. A plugin whose build has not run — freshly
 * cloned, or a build that failed — therefore has a valid manifest and no
 * importable bundle, and that is a different condition from a rejected manifest:
 * the pane offers a Rebuild for it instead of reporting it as broken.
 */
export interface PanelPluginStatus {
  pluginId: string;
  name: string;
  /** True when the bundle its manifest names exists on disk. */
  built: boolean;
  /** Why the last build did not produce the bundle, when it did not. */
  reason?: string;
  /** Whether the plugin is a Bun package (has a package.json). */
  isPackage: boolean;
  /**
   * Whether the plugin's contributions are live.
   *
   * Installing and enabling are two separate steps on purpose: a bundled plugin
   * arrives in the catalog UNINSTALLED (VS Code's model — the marketplace is a
   * store, not a preinstalled set), and an installed plugin can be switched off
   * without deleting its directory. A disabled plugin contributes nothing —
   * no activity-bar button, no header button, no editor tab — and its bundle is
   * no longer served.
   */
  enabled: boolean;
  /** Whether the plugin came from the bundled marketplace rather than a git URL. */
  bundled: boolean;
}

/**
 * One plugin the bundled marketplace offers, whether or not it is installed.
 *
 * The catalog is what the Panel Plugins pane lists as AVAILABLE: the bundled
 * marketplace is a store the user installs from, so a plugin sitting in
 * `<package>/marketplace/plugins/` is an offer, not an install. A catalog entry
 * cannot describe what a plugin CONTRIBUTES — that is known only after its
 * bundle loads — so the row carries the identity alone.
 */
export interface PanelCatalogEntry {
  pluginId: string;
  name: string;
  version: string;
  description?: string;
  /** Absolute URL of the plugin's icon, when the store's copy declares one. */
  iconUrl?: string;
  /** Absolute URL of the plugin's README, when the store's copy ships one. */
  readmeUrl?: string;
  /** True once the plugin is installed — the row then offers Enable/Remove. */
  installed: boolean;
}

export interface PanelRegistryPayload {
  /** Installed, enabled plugins — the bundles the host should import. */
  panels: PanelRegistryEntry[];
  marketplaces: PanelMarketplaceItem[];
  errors: PanelPluginError[];
  /** Every installed plugin, with its build and enablement state. */
  plugins: PanelPluginStatus[];
  /** The bundled marketplace's offers, installed or not. */
  catalog: PanelCatalogEntry[];
}
