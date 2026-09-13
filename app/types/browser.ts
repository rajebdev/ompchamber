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
  /** True when the tab was opened by the session's own omp process. */
  owned: boolean;
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
  width: number;
  height: number;
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
  /** `agent` = intent parsed from the eval script; `page` = observed live via CDP. */
  source: 'agent' | 'page';
  at: number;
}
