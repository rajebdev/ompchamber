/**
 * The asset URL shape for a panel, shared by the host and the asset route.
 *
 * The mapping from a panel key to a URL segment lives in ONE place because the
 * route has to parse back what the host wrote: a slug spelled differently on
 * either side is a 404 that looks like a missing file.
 *
 * A key is `plugin:<pluginId>/<panelId>` and the slug is `<pluginId>~<panelId>`
 * — `/` is a path separator and `:` a scheme marker, so neither can appear in a
 * URL path segment, and `~` is unreserved.
 */

/** `plugin:hello/greeter` → `hello~greeter`. */
export function slugForPanelKey(panelKey: string): string {
  return panelKey.replace(/^plugin:/, '').replace('/', '~');
}

/** URL base for a panel's assets, ending in a slash so relative paths resolve. */
export function panelAssetBase(panelKey: string): string {
  return `/api/panels/file/${encodeURIComponent(slugForPanelKey(panelKey))}/`;
}

/** Absolute URL for one file inside a panel's directory. */
export function panelAssetUrl(panelKey: string, relPath: string): string {
  return `${panelAssetBase(panelKey)}${relPath.split('/').map(encodeURIComponent).join('/')}`;
}
