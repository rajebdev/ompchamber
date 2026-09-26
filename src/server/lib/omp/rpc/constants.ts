/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types, constants and pure helpers for the omp session RPC manager.
 * Kept separate from the session wrapper/registry so each file stays under the
 * repo's per-file size ceiling.
 */

import { homedir } from 'os';
import { pathExists } from '@/server/lib/omp/core/paths';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export type EventListener = (event: AgentEvent) => void;

export interface RpcSessionState {
  sessionId: string;
  sessionFile?: string;
  sessionName?: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled?: boolean;
  interruptMode: 'immediate' | 'wait';
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  model?: { id: string; provider: string; name?: string; reasoning?: boolean; thinking?: { efforts?: string[] } };
  messageCount: number;
  queuedMessageCount: number;
  contextUsage?: { tokens: number; contextWindow: number; percent: number } | null;
  systemPrompt?: string[];
  thinkingLevel?: string;
  fastMode?: boolean;
  fastModeEnabled?: boolean;
  fastModeActive?: boolean;
  tokensPerSecond?: number | null;
  todoPhases?: unknown[];
}

export interface WebSessionState {
  sessionId: string;
  sessionFile: string;
  sessionName?: string;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled?: boolean;
  interruptMode: 'immediate' | 'wait';
  steeringMode: 'all' | 'one-at-a-time';
  followUpMode: 'all' | 'one-at-a-time';
  model?: { id: string; provider: string; name?: string; reasoning?: boolean; thinking?: { efforts?: string[] } };
  messageCount: number;
  queuedMessageCount: number;
  contextUsage: { tokens: number; contextWindow: number; percent: number } | null;
  systemPrompt: string;
  thinkingLevel: string;
  fastModeEnabled: boolean;
  fastModeActive?: boolean;
  tokensPerSecond: number | null;
  todoPhases: unknown[];
}

export const IDLE_DESTROY_MS = 10 * 60 * 1000;
// Longest a subagent may go without a frame before the wrapper stops counting
// it as live work. A terminal frame lost to a protocol hiccup would otherwise
// pin the session's omp process (and its whole process group) open forever; the
// price of the window is at most one idle omp process.
export const SUBAGENT_STALE_MS = 30 * 60 * 1000;
export const READY_TIMEOUT_MS = 120_000;
export const GET_STATE_TIMEOUT_MS = 5_000;
export const PROMPT_ACK_TIMEOUT_MS = 30_000;
export const NON_TERMINAL_CONTINUATION_GRACE_MS = 2_000;
export const AWAITING_AGENT_START_TIMEOUT_MS = 10_000;
export const RESTARTING_MESSAGE = 'This session is restarting — retry in a moment.';
// A command timeout is not proof an omp child is wedged: omp runs RPC handlers
// one at a time, so a slow `get_state`/`prompt` ack can simply be queued behind
// the running turn. That session keeps its process — only a session that is
// idle AND unresponsive is reset.
export const SESSION_BUSY_MESSAGE = 'The OMP session is busy with the running turn; retry once it settles.';

export class WebRpcError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WebRpcError';
    this.code = code;
  }
}

// Commands forwarded to omp verbatim (request shape already matches rpc-types).
export const PASSTHROUGH_COMMANDS = new Set([
  'abort',
  'abort_and_prompt',
  // steer: interrupt/redirect the running agent; follow_up: enqueue a message the agent handles after the current turn.
  'steer',
  'follow_up',
  'set_thinking_level',
  'cycle_thinking_level',
  'cycle_model',
  'get_available_models',
  'set_auto_compaction',
  'set_auto_retry',
  'abort_retry',
  'abort_bash',
  'set_todos',
  'set_steering_mode',
  'set_follow_up_mode',
  'set_interrupt_mode',
  'get_messages',
  'get_messages_page',
  'get_subagents',
  'get_subagent_messages',
  'set_subagent_subscription',
  'get_login_providers',
  'login',
]);

// Commands that only READ live process state, with an RPC-free on-disk
// equivalent. A live session answers them on the fast path; for one the chamber
// does not manage, the spawn path must refuse them (409) rather than boot an
// omp child to answer a read. The sidebar renders a roster row for every
// session in the list, so an unconditional probe started a process per finished
// session merely looked at (measured: the omp process count grew on a session
// whose liveness probe had just reported `running: false`).
export const OBSERVER_ONLY_COMMANDS = new Set(['get_subagents', 'get_subagent_messages']);

// Commands that can carry user-attached images to the model. All of them must
// pass the same server-side per-image/count/aggregate validation before the
// payload reaches omp — a client is free to POST any of them directly.
export const IMAGE_BEARING_COMMANDS = new Set(['prompt', 'steer', 'follow_up', 'abort_and_prompt']);

// `extension_ui_request` methods that BLOCK the agent until the matching
// `extension_ui_response` arrives. omp emits no re-delivery, so the server is
// the only place a still-pending request can be remembered across a client
// reload. `cancel`, `notify`, `open_url`, `setWidget`, ... are fire-and-forget.
export const ANSWERABLE_UI_METHODS = new Set(['select', 'confirm', 'input', 'editor']);

export const MAX_ATTACHED_IMAGES = 20;
export const MAX_ATTACHED_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_AGGREGATE_IMAGE_BYTES = 40 * 1024 * 1024;

export function validateAgentImages(images: unknown): string | null {
  if (images === undefined) return null;
  if (!Array.isArray(images)) return 'images must be an array';
  if (images.length > MAX_ATTACHED_IMAGES) return `Maximum of ${MAX_ATTACHED_IMAGES} attached images reached.`;
  let aggregate = 0;
  for (const image of images) {
    if (!image || typeof image !== 'object') return 'invalid image entry';
    const data = (image as { data?: unknown }).data;
    const mimeType = (image as { mimeType?: unknown }).mimeType;
    if (typeof data !== 'string' || typeof mimeType !== 'string') return 'invalid image entry';
    const bytes = Buffer.byteLength(data, 'base64');
    if (bytes > MAX_ATTACHED_IMAGE_BYTES) return `Images up to ${Math.round(MAX_ATTACHED_IMAGE_BYTES / 1024 / 1024)} MB are supported.`;
    aggregate += bytes;
  }
  if (aggregate > MAX_AGGREGATE_IMAGE_BYTES) return 'Total image size exceeds the supported limit.';
  return null;
}

export function toImageContents(value: unknown): Array<{ type: 'image'; data: string; mimeType: string }> | undefined {
  const images = value as Array<{ type: 'image'; data: string; mimeType: string }> | undefined;
  return images?.length ? images : undefined;
}

/** Pick a spawn cwd that actually exists. A session records the directory it
 * was created in, but that directory may have been deleted since: spawn()
 * would fail with ENOENT and `omp --cwd <missing>` throws in setProjectDir. */
export async function resolveSpawnCwd(recordedCwd?: string | null): Promise<string> {
  if (recordedCwd && (await pathExists(recordedCwd))) return recordedCwd;
  try {
    const serverCwd = process.cwd();
    if (serverCwd && (await pathExists(serverCwd))) return serverCwd;
  } catch {
    // process.cwd() itself throws when the server's own cwd was removed.
  }
  return homedir();
}

/** Extra CLI args for spawning `omp --mode rpc-ui` for a session. */
export function buildSessionSpawnArgs(sessionFile: string, approvalMode?: ApprovalMode): string[] {
  const args: string[] = [];
  if (sessionFile) {
    // An absolute path resolves deterministically: omp's createSessionManager
    // opens it directly via SessionManager.open without any interactive
    // resume/fork prompts.
    args.push('--resume', sessionFile);
  }
  if (approvalMode) {
    // Spawn-time only: omp exposes no RPC command to change the tool-approval
    // mode, so the flag is the sole lever. It works with or without --resume.
    args.push('--approval-mode', approvalMode);
  }
  return args;
}
