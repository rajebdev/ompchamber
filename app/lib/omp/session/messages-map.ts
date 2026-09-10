/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMessageData, ToolCallData } from '@/types/chat';
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

/** Map a raw omp JSONL entry of type "message" to the chamber shape. */
export function toChatMessage(entry: OmpMessageEntry): ChatMessageData | null {
  const msg = entry.message;
  if (!msg) return null;
  const role = msg.role ?? '';
  const content = msg.content;

  const base: ChatMessageData = {
    id: entry.id ?? `msg-${entry.timestamp ?? Date.now()}`,
    role: roleFor(role),
    content: '',
    date: entry.timestamp ? new Date(entry.timestamp).toISOString() : undefined,
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
  const stoppedWithError =
    msg.stopReason === 'error' ||
    typeof msg.errorStatus === 'number' ||
    typeof msg.errorMessage === 'string';
  const message: ChatMessageData = {
    ...base,
    content: parsed.textParts.join('\n').trim(),
  };
  if (stoppedWithError) {
    message.error = {
      status: typeof msg.errorStatus === 'number' ? msg.errorStatus : undefined,
      id: typeof msg.errorId === 'number' ? msg.errorId : undefined,
      message: typeof msg.errorMessage === 'string' ? msg.errorMessage : undefined,
      stopReason: typeof msg.stopReason === 'string' ? msg.stopReason : undefined,
    };
  }
  if (parsed.thinking) message.thinking = { thought: parsed.thinking, isGenerating: false };
  if (parsed.intent) message.intent = parsed.intent;
  if (parsed.toolCalls.length > 0) {
    message.toolCalls = parsed.toolCalls.map((call) => ({
      ...call,
      output: parsed.outputs.get(call.id) || undefined,
      status: (msg.isError ? 'error' : 'success') as ToolCallData['status'],
    }));
  }
  // Error turns are kept even when they carry no text/tools so the failure is
  // visible in the timeline instead of silently vanishing.
  if (!message.content && !message.thinking && !message.toolCalls?.length && !message.systemNote && !message.error) {
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

/** Map an omp `custom_message` entry (ultrathink-notice, xdev-mount-notice,
 *  ...) to a notice row. Returns null for non-notice custom messages. */
export function noticeFromCustomMessage(record: Record<string, unknown>): ChatMessageData | null {
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
    id: typeof record.id === 'string' ? record.id : `notice-${Date.now()}`,
    role: 'ai',
    content: '',
    notice,
    date: typeof record.timestamp === 'string' ? new Date(record.timestamp).toISOString() : undefined,
  };
}
