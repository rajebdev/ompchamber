/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The panel-plugin contract.
 *
 * These types describe what the HOST sends and what a panel may ask for. They
 * live in a package rather than being copied into each plugin so the two ends
 * cannot drift: the chamber's own `shared/lib/panels/protocol.ts` builds these
 * messages, and a plugin that imported a stale hand-written copy would fail at
 * runtime with no type error to catch it.
 *
 * The module is TYPE-ONLY plus two tiny helpers, and that is deliberate: the
 * frame runs with an opaque origin and a strict CSP, so anything imported here
 * is bundled into the plugin. Keeping it free of side effects means the whole
 * package costs a few bytes.
 */

/** Where a contributed panel renders. */
export type PanelPosition = 'right' | 'editor';

/**
 * What a panel may ask the host for. Declaring one in the manifest is the grant;
 * calling a method without it is refused by name.
 */
export type PanelCapability = 'theme' | 'session-state' | 'workspace-read';

/** Everything the host seeds a frame with. */
export interface PanelInfo {
  /** The panel's title, from the manifest. */
  title: string;
  /** `plugin:<pluginId>/<panelId>`. */
  panelKey: string;
  /** Base URL for the plugin's own files. */
  assetBase: string;
  /** The live palette id, e.g. `paper`. */
  theme: string;
  /** The active session, or null. */
  sessionId: string | null;
  /** The active workspace root, or null. */
  workspacePath: string | null;
  /** The capability groups the host will answer. */
  capabilities: PanelCapability[];
}

/**
 * The bridge the host injects as `window.acquireChamberPanel()`.
 *
 * Every method is optional-callback style rather than event-emitter: the host
 * assigns a single handler, and a panel replaces it by assigning again. Two
 * subscribers would need an emitter on both sides for no gain.
 */
export interface ChamberPanelApi {
  /** Resolves once the host has seeded the frame. */
  ready: Promise<PanelInfo>;
  /** Ask the host for something. Rejects with the host's own reason. */
  call<T = unknown>(method: PanelMethod, params?: Record<string, unknown>): Promise<T>;
  /** The palette changed. The host sends only the id. */
  onTheme?: (theme: string) => void;
  /**
   * The session context changed after the handshake.
   *
   * `workspacePath` and `sessionId` are resolved asynchronously by the chamber,
   * so they are usually still empty when `ready` settles; this is how the real
   * values arrive.
   */
  onContext?: (info: PanelInfo) => void;
  theme?: string;
}

/** The methods the host implements. Anything else is answered as unknown. */
export type PanelMethod =
  | 'theme.get'
  | 'sessionState.get'
  | 'sessionState.set'
  | 'workspace.list'
  | 'workspace.readText';

/**
 * The API, or a throw naming the real problem.
 *
 * A plugin page opened outside a panel frame has no bridge; saying so beats a
 * `undefined is not a function` from the first `.call()`.
 */
export function acquirePanel(): ChamberPanelApi {
  const api = (globalThis as { acquireChamberPanel?: () => ChamberPanelApi }).acquireChamberPanel?.();
  if (!api) {
    throw new Error('The OMPChamber bridge is unavailable — is this page open outside a panel frame?');
  }
  return api;
}

/** One file inside a plugin, as a URL the frame can load. */
export function assetUrl(info: Pick<PanelInfo, 'assetBase'>, relativePath: string): string {
  return `${info.assetBase}${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}
