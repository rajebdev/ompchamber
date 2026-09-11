/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only full-JSONL loader for a single oh-my-pi session file, mapping the
 * omp message stream to the chamber ChatMessageData shape so the chat timeline
 * renders faithfully (thinking accordions, tool calls with their results,
 * assistant text, user turns).
 *
 * omp writes one JSONL entry per message turn, but a single assistant entry
 * may hold several blocks: thinking, toolCall, toolResult and text. The
 * mapping below:
 *   - turns each omp "message" entry into one ChatMessageData
 *   - lifts `thinking` blocks into msg.thinking
 *   - lifts `toolCall` blocks into msg.toolCalls (ToolCallData)
 *   - pairs toolResult blocks with the toolCallId of their tool call and folds
 *     their text into that tool's `output` (skipping image/refusal payloads)
 *   - joins text blocks into msg.content
 */

import { readFileSync, statSync } from 'fs';
import { parseJsonlLenient } from '@/lib/omp/session/jsonl';
import { normalizeNoticePositions } from '@/lib/chat/order';
import type { ChatMessageData } from '@/types/chat';
import {
  toChatMessage,
  collectToolOutputs,
  noticeFromCustomMessage,
  type SequenceState,
} from '@/lib/omp/session/messages-map';
import type { OmpMessageEntry } from '@/lib/omp/session/messages-parse';

const MAX_SESSION_LOAD_BYTES = 512 * 1024 * 1024;

/**
 * Load a session file and return the chat timeline in chronological order.
 * Assistant messages carry thinking accordion + tool calls (with outputs
 * paired from their toolResult entries); tool plumbing rows are folded in.
 */
export function loadSessionMessages(filePath: string): ChatMessageData[] {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_SESSION_LOAD_BYTES) return [];
  } catch {
    return [];
  }

  let body: string;
  try {
    body = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const records = parseJsonlLenient<Record<string, unknown>>(body);
  const state: SequenceState = { messages: [], outputsByCall: collectToolOutputs(records) };

  for (const record of records) {
    if (record?.type === 'custom_message' || record?.type === 'custom') {
      const notice = noticeFromCustomMessage(record);
      if (notice) state.messages.push(notice);
      continue;
    }
    if (record?.type !== 'message') continue;
    const mapped = toChatMessage(record as unknown as OmpMessageEntry);
    if (!mapped) continue;
    // Fold the collected outputs into this message's tool calls.
    if (mapped.toolCalls?.length) {
      mapped.toolCalls = mapped.toolCalls.map((call) => {
        const collected = state.outputsByCall.get(call.id);
        return {
          ...call,
          output: call.output || collected?.output || undefined,
          details: (call.details || collected?.details || undefined) as Record<string, any> | undefined,
          status: collected?.isError ? 'error' : call.status,
        };
      });
    }
    state.messages.push(mapped);
  }
  return normalizeNoticePositions(state.messages);
}

/** Derive the display title from the JSONL header/title slot (cheap read). */
export function loadSessionTitle(filePath: string): string | undefined {
  try {
    const stat = statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) return undefined; // only need the head
  } catch {
    return undefined;
  }
  try {
    const head = readFileSync(filePath, 'utf8').slice(0, 32 * 1024);
    const records = parseJsonlLenient<Record<string, unknown>>(head);
    const first = records[0];
    if (first?.type === 'title' && typeof first.title === 'string' && first.title.trim()) {
      return first.title.trim();
    }
    const header = records.find((r) => r?.type === 'session');
    if (typeof header?.title === 'string' && header.title.trim()) {
      return header.title.trim();
    }
    // Fallback: extract from session_init task
    const init = records.find((r) => r?.type === 'session_init');
    if (init && typeof init.task === 'string' && init.task.trim()) {
      const taskLines = init.task.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('Complete assignment'));
      if (taskLines.length > 0) {
        return taskLines[0].slice(0, 60);
      }
    }
    // Fallback: extract from first user message
    const userMsg = records.find((r) => r?.type === 'message' && (r as any).message?.role === 'user');
    if (userMsg) {
      const text = (userMsg as any).message?.content;
      const str = typeof text === 'string' ? text : Array.isArray(text) ? text.map((c: any) => c.text || '').join('') : '';
      const lines = str.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('Complete assignment'));
      if (lines.length > 0) {
        return lines[0].slice(0, 60);
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the model last used by a session from its `model_change` entries
 *  (omp records `"provider/model-id"`). Returns undefined when the file has
 *  no model_change entry or the value is malformed. */
export function loadSessionModel(filePath: string): { provider: string; modelId: string } | undefined {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_SESSION_LOAD_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    const body = readFileSync(filePath, 'utf8');
    const records = parseJsonlLenient<Record<string, unknown>>(body);
    let last: { provider: string; modelId: string } | undefined;
    for (const record of records) {
      if (record?.type !== 'model_change') continue;
      const model = typeof record.model === 'string' ? record.model : undefined;
      if (!model) continue;
      const slash = model.indexOf('/');
      if (slash <= 0 || slash === model.length - 1) continue;
      last = { provider: model.slice(0, slash), modelId: model.slice(slash + 1) };
    }
    return last;
  } catch {
    return undefined;
  }
}

/** Resolve the thinking level last used by a session from its
 *  `thinking_level_change` entries (omp records the level string, e.g.
 *  "off" | "minimal" | "low" | "medium" | "high" | "max"). */
export function loadSessionThinkingLevel(filePath: string): string | undefined {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_SESSION_LOAD_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    const body = readFileSync(filePath, 'utf8');
    const records = parseJsonlLenient<Record<string, unknown>>(body);
    let last: string | undefined;
    for (const record of records) {
      if (record?.type !== 'thinking_level_change') continue;
      const level = typeof record.thinkingLevel === 'string' && record.thinkingLevel.trim()
        ? record.thinkingLevel.trim()
        : undefined;
      if (level) last = level;
    }
    return last;
  } catch {
    return undefined;
  }
}
