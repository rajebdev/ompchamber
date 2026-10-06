/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The host services the kit reads, and the seam that installs them.
 *
 * `@ompchamber/ui` is a published package, so it cannot import the chamber's own
 * source. The host therefore INJECTS its services once at boot via
 * `configureUiKit`, and every hook in this package reads them from here.
 *
 * Each field is something a plugin genuinely cannot do itself: read the
 * chamber's per-session store, know the live palette, resolve the active
 * workspace, or render the chamber's markdown pipeline. Anything a plugin could
 * read from the DOM it should read from the DOM.
 */

import type { ComponentType } from 'preact';

/** What the host seeds every plugin component with. */
export interface PanelContext {
  sessionId: string | null;
  workspacePath: string | null;
  theme: string;
}

/**
 * The props a panel BODY is rendered with.
 *
 * A built-in view and a plugin panel receive the SAME shape from the same
 * catalog, so this type is the contract both sides compile against. Every field
 * but the three the layout always knows is optional: a view ignores what it does
 * not use, and a plugin registered for the right panel may ignore all of them
 * and read `usePanelInfo()` instead.
 */
export interface PanelHostProps {
  /** The active session id, or null. */
  sessionId?: string | null;
  /** False when the view has nothing to read — no workspace, or it is hidden. */
  enabled: boolean;
  /** True while this is the view on screen. */
  active: boolean;
  /** Bumped after a write, so a tree/list view re-reads. */
  refreshKey: number;
  /** The active workspace root, when there is one. */
  rootPath?: string;
  onRefresh?: () => void;
  onOpenFile?: (file: unknown) => void;
  onClose?: () => void;
  /** The phone's drawer hides a view's own header; the desktop stack does not. */
  showHeader?: boolean;
}

/**
 * Props for the chamber's markdown renderer, injected as a component.
 *
 * The renderer is NOT bundled into the kit: it pulls the chamber's own marked /
 * KaTeX / mermaid / Shiki pipeline and the host's file-opening and clipboard
 * hooks, which is a large tree a plugin must not carry twice. The host hands the
 * kit the component instead, so a wiki page or a plan reads exactly like the
 * chat timeline without the kit owning any of that machinery.
 */
export interface HostMarkdownProps {
  content: string;
  className?: string;
}

/** The host's own services, injected once. */
export interface UiKitServices {
  /** The current panel context. */
  context(): PanelContext;
  /** Subscribe to context changes (a new session, a palette switch). */
  subscribe(listener: (context: PanelContext) => void): () => void;
  /** Read one per-session value. */
  getSessionValue(sessionId: string | null, key: string): string | null;
  /** Write one per-session value. */
  setSessionValue(sessionId: string | null, key: string, value: string): void;
  /**
   * Subscribe to writes of ONE per-session value, from any component.
   *
   * Optional so a host built before this seam still runs a newer kit — the
   * hook degrades to read-on-mount, which is what every host did.
   *
   * It exists because `getSessionValue` alone makes two readers of one key
   * disagree: a component reads the store once and then holds its own copy, so
   * a field that WRITES a value and a readout that DISPLAYS it are two private
   * copies of the same fact, and the readout keeps the value it read at mount
   * forever.
   */
  subscribeSessionValue?(sessionId: string | null, key: string, listener: () => void): () => void;
  /**
   * Typed per-session state, for a view that stores more than a string.
   *
   * `useSessionValue` covers the common case (a note, a path); a collapsed-phase
   * map or a picked file is not a string, and JSON-encoding it into one would
   * make every reader parse it back. These three are the same store, untyped by
   * the kit and narrowed by the caller.
   *
   * Optional so an older host still runs: `useSessionState` then answers its
   * fallback and never persists, which is honest about a host that cannot.
   */
  getSessionJson?<T>(sessionId: string | null, key: string): T | undefined;
  setSessionJson?(sessionId: string | null, key: string, value: unknown): void;
  subscribeSessionJson?(sessionId: string | null, key: string, listener: () => void): () => void;
  /** Read a text file inside the active workspace. Rejects with the reason. */
  readWorkspaceFile(workspacePath: string | null, relativePath: string): Promise<string>;
  /** The chamber's markdown renderer, so a plugin does not bundle a second one. */
  markdown?(): ComponentType<HostMarkdownProps> | null;
}

let services: UiKitServices | null = null;

/** Called ONCE by the host at boot. A plugin must never call this. */
export function configureUiKit(next: UiKitServices): void {
  services = next;
}

export function requireServices(): UiKitServices {
  if (!services) {
    throw new Error(
      'The OMPChamber UI kit has no host services — this component must be rendered by the OMPChamber app.',
    );
  }
  return services;
}

/** The host services as they stand, or null outside the app. */
export function uiKitServices(): UiKitServices | null {
  return services;
}
