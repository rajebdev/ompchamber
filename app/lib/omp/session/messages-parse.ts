/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RELOAD-path adapter: raw omp JSONL entries → chamber ChatMessageData parts.
 * Content-block parsing is delegated to the shared core parser
 * (parse-message-blocks.ts) — the same one the live SSE path uses — so the
 * two render paths cannot drift. This module keeps only JSONL-specific
 * concerns: the entry wrapper shape, role folding, and image attachments.
 */

import type { ToolCallData } from '@/types/chat';
import {
  extractText as coreExtractText,
  extractUserImageAttachments,
  isRecord,
  parseMessageBlocks,
  stripInlinedTextAttachments,
  toToolCallData,
} from '@/lib/omp/session/parse-message-blocks';

export interface OmpMessageEntry {
  type?: string;
  customType?: string;
  id?: string;
  timestamp?: string;
  parentId?: string | null;
  content?: unknown;
  details?: unknown;
  message?: {
    role?: string;
    content?: unknown;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    details?: unknown;
    stopReason?: string;
    errorStatus?: number;
    errorId?: number;
    errorMessage?: string;
    [key: string]: unknown;
  };
}

export { isRecord, stripInlinedTextAttachments };

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
export function extractText(content: unknown): string {
  return coreExtractText(content);
}

type ChatRole = 'user' | 'ai' | 'assistant';

export function roleFor(role: string | undefined): ChatRole {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'ai';
  return 'assistant';
}

/** Strip a toolResult's text into a plain output string (skip binary/refusal). */
export function resultOutput(message: OmpMessageEntry['message']): string {
  if (!message) return '';
  const blocks = Array.isArray(message.content) ? (message.content as Record<string, unknown>[]) : [];
  const parts: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block) || block.type !== 'text') continue;
    if (typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

export interface ParsedAssistantTurn {
  thinking?: string;
  toolCalls: ToolCallData[];
  textParts: string[];
  /** Short human intent (omp arguments.i) for the tool calls in this turn. */
  intent?: string;
}

export function parseAssistantContent(content: unknown): ParsedAssistantTurn {
  const parsed = parseMessageBlocks(content);
  const toolCalls = parsed.toolCalls.map((tc) =>
    toToolCallData(tc, { streaming: false, output: parsed.inlineOutputs.get(tc.id) ?? undefined }),
  );
  return {
    thinking: parsed.thinking,
    toolCalls,
    textParts: parsed.textParts,
    intent: parsed.intent,
  };
}

export { extractUserImageAttachments };
