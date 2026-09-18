/**
 * Live browser-viewer contract shared between the /api/browser route and the
 * browser panel. Values are produced server-side from the omp shared-browser
 * daemon (see app/lib/browser/) and consumed by the panel's screencast hook.
 */

/** Why the viewer is not showing frames, or that it is. */
export type BrowserViewStatus = 'agent-offline' | 'browser-offline' | 'no-tab' | 'live';

/** One page target living in the project-shared browser. */
export interface BrowserTabInfo {
  targetId: string;
  url: string;
  title: string;
}

/** Coarse viewer state pushed on every meaningful change. */
export interface BrowserViewState {
  status: BrowserViewStatus;
  url?: string;
  title?: string;
  targetId?: string;
  tabs: BrowserTabInfo[];
}

/** One screencast frame (base64 JPEG) for the currently viewed tab. */
export interface BrowserViewFrame {
  data: string;
  mimeType: string;
  targetId: string;
}

export type BrowserActionKind =
  | 'open'
  | 'navigate'
  | 'loaded'
  | 'click'
  | 'type'
  | 'press'
  | 'submit'
  | 'wait'
  | 'screenshot'
  | 'scroll'
  | 'upload'
  | 'close'
  | 'error';

export interface BrowserPanelAction {
  id: string;
  kind: BrowserActionKind;
  label: string;
}

/** Page context handed from a browser panel to the chat composer draft. */
export interface BrowserPageContext {
  url: string;
  title?: string;
}
