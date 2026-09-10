/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * omp agent event surface types shared by useOmpAgent, the chamber timeline
 * and the AskDialog renderer. Kept separate so the hook file stays under the
 * repo's per-file size ceiling.
 */

/** Frame `extension_ui_request` dari omp (ask dialog, approval, OAuth). */
export type ExtensionUiDialogMethod = 'select' | 'confirm' | 'input' | 'editor';

export interface ExtensionUiDialogRequest {
  type: 'extension_ui_request';
  id: string;
  method: ExtensionUiDialogMethod;
  title: string;
  options?: string[];
  optionDetails?: { description?: string }[];
  message?: string;
  placeholder?: string;
  prefill?: string;
  timeout?: number;
}

export type IncomingExtensionUiRequest =
  | ExtensionUiDialogRequest
  | { type: 'extension_ui_request'; id: string; method: 'cancel'; targetId: string }
  | { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error' }
  | { type: 'extension_ui_request'; id: string; method: 'open_url'; url: string; launchUrl?: string; instructions?: string };
