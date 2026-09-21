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

import { parseJsonlLenient } from '@/shared/lib/omp/session/jsonl';
import { normalizeThinkingLevel } from '@/shared/lib/models/thinking-levels';
import type { ChatMessageData } from '@/shared/types/chat';
import { collectToolOutputs, noticeFromCustomMessage, toChatMessage, type SequenceState } from '@/shared/lib/omp/session/messages-map';
import type { OmpMessageEntry } from '@/shared/lib/omp/session/messages-parse';

const MAX_SESSION_LOAD_BYTES = 512 * 1024 * 1024;

/** omp expands `/skill:<name>` into a `custom_message` record and stores no
 *  user message for it, so the chamber reconstructs the bubble from it. */
function skillUserMessageFromRecord(record: Record<string, unknown>): ChatMessageData | null {
  const details = record.details as { name?: unknown } | undefined;
  const fromDetails = typeof details?.name === 'string' ? details.name : undefined;
  const fromContent = typeof record.content === 'string'
    ? /User invoked the "([^"]+)" skill/.exec(record.content)?.[1]
    : undefined;
  const skillName = fromDetails ?? fromContent;
  if (!skillName) return null;
  const parsed = typeof record.timestamp === 'string' ? new Date(record.timestamp) : undefined;
  const time = parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : undefined;
  return {
    id: typeof record.id === 'string' ? record.id : `skill-${Date.now()}`,
    role: 'user',
    content: `/skill:${skillName}`,
    date: time ? `Today, ${time}` : undefined,
    timestamp: time,
  };
}

/**
 * Load a session file and return the chat timeline in **file order** — the
 * order omp wrote the entries, which is the session's chronology. The API
 * response is a faithful projection of the JSONL: nothing here reorders rows,
 * and no display-side reordering is applied anywhere either (a notice row
 * renders exactly where omp wrote it).
 */
export async function loadSessionMessages(filePath: string): Promise<ChatMessageData[]> {
  try {
    const file = Bun.file(filePath);
    if ((await file.stat()).size > MAX_SESSION_LOAD_BYTES) return [];
  } catch {
    return [];
  }

  let body: string;
  try {
    body = await Bun.file(filePath).text();
  } catch {
    return [];
  }

  const records = parseJsonlLenient<Record<string, unknown>>(body);
  const state: SequenceState = { messages: [], outputsByCall: collectToolOutputs(records) };
  // omp records the thinking level as separate `thinking_level_change` entries
  // (session state), not as a per-message field. Walk the records in order and
  // stamp the level in effect onto each assistant turn so the footer shows the
  // level that actually served it — not the last level used in the session.
  let currentLevel: string | undefined;
  const levelFor = (record: Record<string, unknown>): string | undefined => {
    if (record?.type === 'thinking_level_change') {
      currentLevel = normalizeThinkingLevel(record.thinkingLevel);
    }
    return currentLevel;
  };

  for (const record of records) {
    const level = levelFor(record);
    if (record?.type === 'custom_message' && record.customType === 'skill-prompt') {
      const skillMsg = skillUserMessageFromRecord(record);
      if (skillMsg) {
        state.messages.push(skillMsg);
        continue;
      }
    }
    if (record?.type === 'custom_message' || record?.type === 'custom') {
      const notice = noticeFromCustomMessage(record);
      if (notice) state.messages.push(notice);
      continue;
    }
    if (record?.type !== 'message') continue;
    const mapped = toChatMessage(record as unknown as OmpMessageEntry);
    if (!mapped) continue;
    if (level !== undefined && mapped.role !== 'user') {
      mapped.thinkingLevel = level;
    }
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
  return state.messages;
}

/** Derive the display title from the JSONL header/title slot (cheap read). */
export async function loadSessionTitle(filePath: string): Promise<string | undefined> {
  try {
    const file = Bun.file(filePath);
    if ((await file.stat()).size > 10 * 1024 * 1024) return undefined; // only need the head
  } catch {
    return undefined;
  }
  try {
    const head = (await Bun.file(filePath).text()).slice(0, 32 * 1024);
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
    const userMsg = records.find((r) => r?.type === 'message' && (r as Record<string, unknown>).message != null
      && ((r as Record<string, unknown>).message as Record<string, unknown>).role === 'user');
    if (userMsg) {
      const message = (userMsg as Record<string, unknown>).message as Record<string, unknown>;
      const text = message.content;
      const str = typeof text === 'string' ? text : Array.isArray(text) ? text.map((c) => (c as Record<string, unknown>).text || '').join('') : '';
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
export async function loadSessionModel(filePath: string): Promise<{ provider: string; modelId: string } | undefined> {
  try {
    const file = Bun.file(filePath);
    if ((await file.stat()).size > MAX_SESSION_LOAD_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    const body = await Bun.file(filePath).text();
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
export async function loadSessionThinkingLevel(filePath: string): Promise<string | undefined> {
  try {
    const file = Bun.file(filePath);
    if ((await file.stat()).size > MAX_SESSION_LOAD_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    const body = await Bun.file(filePath).text();
    const records = parseJsonlLenient<Record<string, unknown>>(body);
    let last: string | undefined;
    for (const record of records) {
      if (record?.type !== 'thinking_level_change') continue;
      // A change entry always yields a display level: null/unset → "off".
      last = normalizeThinkingLevel(record.thinkingLevel);
    }
    return last;
  } catch {
    return undefined;
  }
}
