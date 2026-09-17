/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMessageData } from '@/types/chat';
import {
  isRecord,
  extractText,
  roleFor,
  extractUserImageAttachments,
  stripInlinedTextAttachments,
  resultOutput,
  parseAssistantContent,
  type OmpMessageEntry,
} from '@/lib/omp/session/messages-parse';
import { deriveTurnError } from '@/lib/omp/session/turn-error';

/** omp turn timestamps arrive as epoch-ms numbers inside the message but as
 *  ISO strings at the JSONL entry level — normalize both to epoch ms. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

/** Map a raw omp JSONL entry of type "message" to the chamber shape. */
export function toChatMessage(entry: OmpMessageEntry): ChatMessageData | null {
  const msg = entry.message;
  if (!msg) return null;
  const role = msg.role ?? '';
  const content = msg.content;
  const attribution = typeof msg.attribution === 'string'
    ? msg.attribution
    : typeof (entry as any).attribution === 'string'
      ? (entry as any).attribution
      : undefined;

  const base: ChatMessageData = {
    id: entry.id ?? `msg-${entry.timestamp ?? Date.now()}`,
    role: roleFor(role),
    content: '',
    date: entry.timestamp ? new Date(entry.timestamp).toISOString() : undefined,
    startedAt: toEpochMs(msg.timestamp) ?? toEpochMs(entry.timestamp),
    attribution,
  };

  if (role === 'user') {
    const text = stripInlinedTextAttachments(extractText(content));
    const attachments = extractUserImageAttachments(content);
    if (!text.trim() && attachments.length === 0) return null;
    return { ...base, content: text, attachments };
  }

  if (role === 'toolResult') {
    const text = resultOutput(msg);
    const toolName = typeof msg.toolName === 'string' ? msg.toolName : undefined;
    const toolCallId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
    if (toolCallId) return null; // consumed by the paired tool call in pass 2
    if (!text && !toolName) return null;
    return { ...base, role: 'assistant', systemNote: toolName ? `[${toolName}] ${text}` : text };
  }

  // Assistant / developer / custom: parse the rich block structure.
  const parsed = parseAssistantContent(content);
  const turnError = deriveTurnError(msg);
  const durationMs = typeof msg.duration === 'number'
    ? msg.duration
    : typeof (entry as any).durationMs === 'number'
      ? (entry as any).durationMs
      : undefined;
  const model = typeof msg.model === 'string'
    ? msg.model
    : typeof (entry as any).model === 'string'
      ? (entry as any).model
      : undefined;
  const provider = typeof msg.provider === 'string' ? msg.provider : undefined;
  const startedAt = typeof base.startedAt === 'number' ? base.startedAt : undefined;
  const completedAt = toEpochMs(msg.completedAt)
    ?? (startedAt !== undefined && durationMs !== undefined ? startedAt + durationMs : undefined);
  const usage = isRecord(msg.usage) ? (msg.usage as ChatMessageData['usage']) : undefined;

  const message: ChatMessageData = {
    ...base,
    content: parsed.textParts.join('\n').trim(),
    model,
    provider,
    completedAt,
    durationMs,
    usage,
  };
  // Live-path parity (mapper.toChatMessage): an assistant turn whose text is a
  // <system-reminder> block renders as a SystemNotice alert, never as raw
  // content — otherwise the reminder leaks into the timeline as markdown.
  if (parsed.textParts.some((t) => /<\/?system-reminder[^>]*>/i.test(t))) {
    const notice = parsed.textParts.join('\n').replace(/<\/?system-reminder[^>]*>/gi, '').trim();
    if (notice) {
      message.notice = notice;
      message.content = '';
    } else if (!parsed.thinking && parsed.toolCalls.length === 0 && !turnError) {
      return null;
    } else {
      message.content = '';
    }
  }
  if (turnError) message.error = turnError;
  if (parsed.thinking) message.thinking = { thought: parsed.thinking, isGenerating: false };
  if (parsed.intent) message.intent = parsed.intent;
  if (parsed.toolCalls.length > 0) {
    // Inline toolResult blocks (same-entry) are already paired by the shared
    // core parser; pass 2 (collectToolOutputs) overrides with later entries.
    message.toolCalls = msg.isError
      ? parsed.toolCalls.map((call) => ({ ...call, status: 'error' as const }))
      : parsed.toolCalls;
  }
  // Error turns are kept even when they carry no text/tools so the failure is
  // visible in the timeline instead of silently vanishing.
  if (!message.content && !message.thinking && !message.toolCalls?.length && !message.systemNote && !message.error && !message.notice) {
    return null;
  }
  return message;
}

export interface CollectedToolResult {
  output: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface SequenceState {
  messages: ChatMessageData[];
  /** toolCallId → output and details accumulated from later toolResult entries. */
  outputsByCall: Map<string, CollectedToolResult>;
}

/**
 * First pass: collect every toolResult output (entry-level) into a map keyed
 * by toolCallId so assistant tool calls rendered later can show their result.
 */
export function collectToolOutputs(records: Record<string, unknown>[]): Map<string, CollectedToolResult> {
  const outputs = new Map<string, CollectedToolResult>();
  for (const record of records) {
    if (record?.type !== 'message') continue;
    const msg = (record as unknown as OmpMessageEntry).message;
    if (!msg || msg.role !== 'toolResult') continue;
    const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
    if (!callId) continue;
    const text = resultOutput(msg);
    const existing = outputs.get(callId);
    let output = text;
    if (existing) {
      if (existing.output.trim() === text.trim() || existing.output.includes(text)) {
        output = existing.output;
      } else if (text.includes(existing.output)) {
        output = text;
      } else {
        output = `${existing.output}\n${text}`;
      }
    }
    const details = (isRecord(msg.details) ? (msg.details as Record<string, unknown>) : undefined) || existing?.details;
    const isError = msg.isError === true || existing?.isError;
    outputs.set(callId, { output, details, isError });
  }
  return outputs;
}

/** Map an omp `custom_message` or `custom` entry (launch-completion,
 *  ultrathink-notice, xdev-mount-notice, ...) to a notice row. `session_exit`
 *  entries are runtime plumbing and are intentionally dropped. */
export function noticeFromCustomMessage(record: Record<string, unknown>): ChatMessageData | null {
  const customType = typeof record.customType === 'string' ? record.customType : '';
  const date = typeof record.timestamp === 'string' ? new Date(record.timestamp).toISOString() : undefined;
  const id = typeof record.id === 'string' ? record.id : `notice-${Date.now()}`;

  if (customType === 'session_exit') return null;

  const content = record.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((b) => (isRecord(b) && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
          .join('')
      : '';
  const notice = text.replace(/<\/?system-notice[^>]*>/g, '').trim();
  if (!notice) return null;
  return {
    id,
    role: 'ai',
    content: '',
    notice,
    date,
  };
}
