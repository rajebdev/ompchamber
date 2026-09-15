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
import { deriveTurnError } from '@/lib/omp/session/turn-error';

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

/** omp turn timestamps arrive as epoch-ms numbers on the live stream but as
 *  ISO strings in some JSONL entries — normalize both to epoch ms. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

/** Convert an omp AgentMessage (content blocks) into the chamber ChatMessageData shape.
 *  Custom-role frames (ultrathink-notice, xdev-mount-notice, ...) become a
 *  `notice` row — omp marks them display:false, so they render as an alert,
 *  never as assistant content. */
export function toChatMessage(raw: Record<string, unknown>, streaming = true): ChatMessageData | null {
  if (raw.role === 'custom') {
    if (raw.customType === 'session_exit') return null; // runtime plumbing, not user-visible
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
  const attribution = typeof raw.attribution === 'string' ? raw.attribution : undefined;
  const startedAt = toEpochMs(raw.timestamp) ?? toEpochMs(raw.startedAt);
  const durationMs = typeof raw.duration === 'number' ? raw.duration : typeof raw.durationMs === 'number' ? raw.durationMs : undefined;
  const completedAt = toEpochMs(raw.completedAt)
    ?? (startedAt !== undefined && durationMs !== undefined ? startedAt + durationMs : undefined);
  const provider = typeof raw.provider === 'string' ? raw.provider : undefined;

  if (raw.role === 'developer' || raw.role === 'system' || parsed.textParts.some((t) => /<\/?system-reminder[^>]*>/i.test(t))) {
    const rawText = parsed.textParts.join('\n').trim();
    const notice = rawText.replace(/<\/?system-reminder[^>]*>/g, '').trim();
    if (!notice) return null;
    return {
      id,
      role: 'ai',
      date: timestamp ? `Today, ${timestamp}` : undefined,
      timestamp,
      content: '',
      notice,
    };
  }

  if (role === 'user') {
    const text = stripInlinedTextAttachments(parsed.textParts.join('\n'));
    const attachments = extractUserImageAttachments(raw.content);
    return {
      id,
      role,
      date: timestamp ? `Today, ${timestamp}` : undefined,
      timestamp,
      startedAt,
      content: text,
      attribution,
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
    attribution,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    provider,
    startedAt,
    completedAt,
    durationMs,
    usage: (raw.usage && typeof raw.usage === 'object') ? (raw.usage as ChatMessageData['usage']) : undefined,
    content: parsed.textParts.join('\n'),
    intent: parsed.intent,
    thinking: parsed.thinking
      ? { thought: parsed.thinking, isGenerating: streaming }
      : (raw.thinking as ChatMessageData['thinking']),
    toolCalls: toolCalls.length > 0 ? toolCalls : (raw.toolCalls as ChatMessageData['toolCalls']),
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    // Aborted/errored turns carry no nested `error` — omp writes flat
    // stopReason/errorMessage fields. Derive them so the turn survives the
    // empty-content guard below and renders live instead of only after reload.
    error: (raw.error as ChatMessageData['error']) ?? deriveTurnError(raw),
  };

  if (
    !message.content &&
    !message.thinking &&
    (!message.toolCalls || message.toolCalls.length === 0) &&
    !message.intent &&
    !message.error &&
    !message.summary &&
    !message.notice
  ) {
    return null;
  }

  return message;
}
