/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LIVE-path adapter: omp agent event/message stream → chamber ChatMessageData.
 * All content-block parsing is delegated to the shared core parser
 * (parse-message-blocks.ts); this module only handles what is genuinely
 * SSE-specific: streaming tool status, incremental output pairing, notice
 * frames, and chamber display timestamps. The JSONL reload path uses the same
 * core via messages-parse.ts — behavior parity is enforced by construction.
 */

import type { ChatMessageData, ToolCallData } from '@/types';
import {
  extractText,
  extractUserImageAttachments,
  parseMessageBlocks,
  stripInlinedTextAttachments,
  toToolCallData,
} from '@/lib/omp/session/parse-message-blocks';

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
export function extractTextFromContent(content: unknown): string {
  return extractText(content);
}

/** Tool events carry result/partialResult as a string or as an omp content
 *  block ({content:[{type:'text',text}]}) — normalize both to plain text. */
export function toolResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const content = (value as { content?: unknown }).content;
    return extractText(content);
  }
  return '';
}

/** Convert an omp AgentMessage (content blocks) into the chamber ChatMessageData shape.
 *  Custom-role frames (ultrathink-notice, xdev-mount-notice, ...) become a
 *  `notice` row — omp marks them display:false, so they render as an alert,
 *  never as assistant content. */
export function toChatMessage(raw: Record<string, unknown>, streaming = true): ChatMessageData | null {
  if (raw.role === 'custom') {
    const content = raw.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? (b as { text?: unknown }).text ?? '' : ''))
            .join('')
        : '';
    const notice = text.replace(/<\/?system-notice[^>]*>/g, '').trim();
    if (!notice) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : `notice-${Date.now()}`,
      role: 'ai',
      content: '',
      notice,
    };
  }

  const parsed = parseMessageBlocks(raw.content);
  const id = typeof raw.id === 'string' ? raw.id : `msg-${raw.timestamp ?? Date.now()}-ai`;
  const role = raw.role === 'user' ? 'user' : 'ai';
  const timestamp = typeof raw.timestamp === 'number'
    ? new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : undefined;

  if (role === 'user') {
    const text = stripInlinedTextAttachments(extractText(parsed.textParts));
    const attachments = extractUserImageAttachments(raw.content);
    return {
      id,
      role,
      date: timestamp ? `Today, ${timestamp}` : undefined,
      timestamp,
      content: text,
      attachments: attachments.map((a) => ({ id: a.id, name: a.name, preview: a.preview, type: a.type })),
    };
  }

  const toolCalls: ToolCallData[] = parsed.toolCalls.map((tc) =>
    toToolCallData(tc, { streaming }),
  );
  const message: ChatMessageData = {
    id,
    role,
    date: timestamp ? `Today, ${timestamp}` : undefined,
    timestamp,
    content: parsed.textParts.join('\n'),
    intent: parsed.intent,
    thinking: parsed.thinking
      ? { thought: parsed.thinking, isGenerating: streaming }
      : (raw.thinking as ChatMessageData['thinking']),
    toolCalls: toolCalls.length > 0 ? toolCalls : (raw.toolCalls as ChatMessageData['toolCalls']),
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    error: raw.error as ChatMessageData['error'],
  };
  return message;
}
