/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * omp agent event surface types shared by useOmpAgent, the chamber timeline
 * and the extension-dialog renderer. Kept separate so the hook file stays under
 * the repo's per-file size ceiling.
 */

import type { ChatMessageData } from '@/shared/types/chat';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

/** One frame of the live agent event stream (WebSocket or SSE). */
export interface OmpAgentEvent {
  type: string;
  [key: string]: unknown;
}

/** Callbacks the timeline hands to useOmpAgent; every frame the stream folds
 *  into ChatMessageData lands on one of these. */
export interface OmpAgentCallbacks {
  onAgentStart?: () => void;
  onMessageUpdate?: (msg: ChatMessageData) => void;
  onMessageEnd?: (msg: ChatMessageData) => void;
  onAgentEnd?: (info: { errorMessage?: string; message?: string }) => void;
  onPromptError?: (errorMessage: string) => void;
  onNotice?: (level: string, message: string) => void;
  onConnected?: () => void;
  /** Mount-time probe found the session mid-run → the stream was reattached
   *  and the UI should resume its generating state. */
  onResumeStream?: () => void;
  /** Ask/approval dialog diminta omp — blocking sampai di-respond. */
  onExtensionUiRequest?: (request: IncomingExtensionUiRequest) => void;
  /** User-message turn delivered by omp (queued steer/follow-up picked up). */
  onQueuedMessageDelivered?: (text: string) => void;
  /** omp applied a model change (set_model). The frame carries no payload, so
   *  consumers should re-read session metadata to refresh the displayed model. */
  onModelChanged?: () => void;
  /** Live activity phrase for the generating indicator ("Editing app/x.ts"),
   *  derived from the tool call or assistant phase the stream is on. */
  onActivity?: (verb: string) => void;
}

export interface OmpAgentState {
  isGenerating: boolean;
  connected: boolean;
  error: string | null;
}

/** An attached image payload accepted by every prompt-bearing RPC command. */
export interface AgentImage {
  data: string;
  mimeType: string;
}

/** Command surface returned by useOmpAgent — the live omp session handle the
 *  chat timeline drives. */
export interface OmpAgentHandle extends OmpAgentState {
  /** Send a prompt to an already-spawned session (warms the process up first).
   *  `accessMode` rides the warmup + prompt bodies: omp has no RPC to change its
   *  tool-approval mode, so the CLI `--approval-mode` flag is applied at spawn
   *  time and the server reconciles an idle session by respawning it. */
  sendPrompt: (message: string, images?: AgentImage[], options?: { accessMode?: ApprovalMode }) => Promise<boolean>;
  /** Spawn a brand-new omp session and send its first prompt; resolves with the
   *  adopted session id (or null on failure). */
  sendNewPrompt: (
    message: string,
    cwd: string,
    images?: AgentImage[],
    composerOptions?: { model?: { provider: string; modelId: string } | null; thinkingLevel?: string | null; accessMode?: ApprovalMode },
  ) => Promise<{ sessionId: string; model: { provider: string; modelId: string } | null } | null>;
  /** Abort the running turn and immediately send `message` as a fresh prompt. */
  sendInterruptAndReply: (message: string, images?: AgentImage[]) => Promise<boolean>;
  /** Enqueue `message` for the agent to process after the current turn. */
  sendFollowUp: (message: string, images?: AgentImage[]) => Promise<boolean>;
  abort: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  /** Answer an ask/approval dialog, releasing omp's blocking tool call. */
  respondToExtensionUi: (
    request: ExtensionUiDialogRequest,
    response: { value: string } | { confirmed: boolean } | { cancelled: true },
  ) => Promise<void>;
  disconnect: () => void;
}

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
