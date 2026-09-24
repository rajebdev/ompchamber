/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client for a session's BTW API: the frame stream, plus the commands that
 * create, continue, cancel and promote a side question.
 *
 * The stream reuses the generic JSON connectors the agent stream introduced
 * (they are transport-only: URL in, decoded frames out), so a session's side
 * questions follow the same transport setting — WebSocket by default, SSE
 * where the upgrade is blocked — instead of forking a third stream flavour.
 */

import type { AgentImage, BtwFrame, BtwState, StreamTransport } from '@/shared/types';
import type { AttachedTextFileData } from '@/shared/lib/chat/attachments';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { connectEvents } from '@/shared/lib/chat/omp/sse';
import { connectSocket } from '@/shared/lib/chat/omp/socket';
import { btwEventsUrl, btwSocketUrl } from '@/shared/lib/chat/omp/transport';
import type { StreamConnection, StreamHandlers } from '@/shared/lib/chat/omp/transport';

export type BtwStreamHandlers = StreamHandlers<BtwFrame>;

/** A rejected command, carrying the server's machine-readable reason. */
export class BtwRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BtwRequestError';
    this.code = code;
  }
}

export function connectBtwStream(
  sessionId: string,
  transport: StreamTransport,
  handlers: BtwStreamHandlers,
): StreamConnection {
  return transport === 'sse' ? connectEvents(btwEventsUrl(sessionId), handlers) : connectSocket(btwSocketUrl(sessionId), handlers);
}

interface BtwResponseBody {
  success?: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

async function requestBtw<T>(sessionId: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/btw/${encodeURIComponent(sessionId)}`, {
    method,
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const payload = (await response.json().catch(() => null)) as BtwResponseBody | null;
  if (!response.ok || !payload?.success) {
    throw new BtwRequestError(payload?.error ?? `Side question request failed (${response.status})`, payload?.code);
  }
  return payload.data as T;
}

/** The session's side questions as the server sees them. */
export function fetchBtwState(sessionId: string): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'GET');
}

export interface AskBtwInput {
  topicId?: string;
  question: string;
  images?: AgentImage[];
  /** Text files inlined for this question (read at attach time by the composer). */
  textFiles?: AttachedTextFileData[];
  /** Composer picks for a FIRST question — a topic that does not exist yet has
   *  no row to hold them, so they ride the ask and reach the spawn. */
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  approvalMode?: ApprovalMode;
}

export function askBtwQuestion(sessionId: string, input: AskBtwInput): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', {
    action: 'ask',
    question: input.question,
    ...(input.topicId ? { topicId: input.topicId } : {}),
    ...(input.images?.length ? { images: input.images } : {}),
    ...(input.textFiles?.length ? { textFiles: input.textFiles } : {}),
    ...(input.model ? { provider: input.model.provider, modelId: input.model.id } : {}),
    ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
    ...(input.approvalMode ? { accessMode: input.approvalMode } : {}),
  });
}

export function abortBtwQuestion(sessionId: string, topicId: string): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'abort', topicId });
}

export function setBtwModel(sessionId: string, topicId: string, provider: string, modelId: string): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'set_model', topicId, provider, modelId });
}

export function setBtwThinkingLevel(sessionId: string, topicId: string, level: string): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'set_thinking_level', topicId, level });
}

export function setBtwAccessMode(sessionId: string, topicId: string, accessMode: ApprovalMode): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'set_access_mode', topicId, accessMode });
}

export function respondBtwDialog(
  sessionId: string,
  topicId: string,
  id: string,
  response: { value: string } | { confirmed: boolean } | { cancelled: true },
): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'dialog_response', topicId, id, response });
}

export function promoteBtwTopic(sessionId: string, topicId: string): Promise<{ sessionId: string }> {
  return requestBtw<{ sessionId: string }>(sessionId, 'POST', { action: 'promote', topicId });
}

export function deleteBtwTopic(sessionId: string, topicId: string): Promise<BtwState> {
  return requestBtw<BtwState>(sessionId, 'POST', { action: 'delete', topicId });
}
