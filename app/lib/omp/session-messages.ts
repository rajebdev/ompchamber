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
import { parseJsonlLenient } from './session-jsonl';
import type { ChatMessageData, ToolCallData, ToolType } from '@/types/chat';

const MAX_SESSION_LOAD_BYTES = 512 * 1024 * 1024;

type Role = ChatMessageData['role'];

interface OmpBlock {
  type?: string;
  [key: string]: unknown;
}

interface OmpMessageEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  parentId?: string | null;
  message?: {
    role?: string;
    content?: unknown;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    details?: unknown;
    [key: string]: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n');
}

function roleFor(role: string | undefined): Role {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'ai';
  return 'assistant';
}

function inferToolType(name?: string): ToolType {
  const lower = (name || '').toLowerCase();
  if (lower.includes('bash') || lower.includes('terminal') || lower.includes('shell') || lower.includes('run')) {
    return 'bash';
  }
  if (lower.includes('write') || lower.includes('edit') || lower.includes('patch') || lower.includes('apply')) {
    return 'edit_file';
  }
  if (lower.includes('create')) return 'create_file';
  if (lower.includes('read') || lower.includes('view') || lower.includes('list')) return 'read_file';
  if (lower.includes('search') || lower.includes('grep') || lower.includes('find') || lower.includes('glob')) {
    return 'search_fs';
  }
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('http')) return 'web_search';
  return 'custom';
}

function toolTitleFor(block: OmpBlock): string {
  const name = typeof block.name === 'string' ? block.name : 'tool';
  const intent =
    isRecord(block.arguments) && typeof block.arguments.i === 'string'
      ? (block.arguments.i as string)
      : isRecord(block.arguments) && typeof block.arguments.path === 'string'
        ? (block.arguments.path as string)
        : undefined;
  return intent ? `${name} — ${intent}` : name;
}

function targetFor(block: OmpBlock): string | undefined {
  if (!isRecord(block.arguments)) return undefined;
  const path = block.arguments.path;
  return typeof path === 'string' ? path : undefined;
}

function commandFor(block: OmpBlock): string | undefined {
  if (!isRecord(block.arguments)) return undefined;
  if (typeof block.arguments.command === 'string') return block.arguments.command as string;
  if (typeof block.arguments.cmd === 'string') return block.arguments.cmd as string;
  return undefined;
}

function inputFor(block: OmpBlock): string | Record<string, unknown> | undefined {
  if (!isRecord(block.arguments)) return undefined;
  const { i: _intent, ...rest } = block.arguments as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function toToolCall(block: OmpBlock): ToolCallData | null {
  const id = typeof block.id === 'string' ? block.id : `tool-${Math.random().toString(36).slice(2, 10)}`;
  const name = typeof block.name === 'string' ? block.name : undefined;
  const type = inferToolType(name);
  return {
    id,
    type,
    name,
    title: toolTitleFor(block),
    target: targetFor(block),
    command: commandFor(block),
    input: inputFor(block),
    status: 'success',
  };
}

/** Strip a toolResult's text into a plain output string (skip binary/refusal). */
function resultOutput(message: OmpMessageEntry['message']): string {
  if (!message) return '';
  const blocks = Array.isArray(message.content) ? (message.content as OmpBlock[]) : [];
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'text') continue;
    if (typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

interface ParsedBlocks {
  thinking?: string;
  toolCalls: ToolCallData[];
  /** toolCallId → text output accumulated from following toolResult entries. */
  outputs: Map<string, string>;
  textParts: string[];
}

function parseAssistantContent(content: unknown): ParsedBlocks {
  const result: ParsedBlocks = { toolCalls: [], outputs: new Map(), textParts: [] };
  if (typeof content === 'string') {
    result.textParts.push(content);
    return result;
  }
  if (!Array.isArray(content)) return result;

  for (const raw of content) {
    if (!isRecord(raw)) continue;
    const block = raw as OmpBlock;
    if (block.type === 'thinking') {
      if (typeof block.thinking === 'string') result.thinking = block.thinking;
      else if (typeof block.text === 'string') result.thinking = block.text;
    } else if (block.type === 'toolCall') {
      const call = toToolCall(block);
      if (call) {
        result.toolCalls.push(call);
        result.outputs.set(call.id, '');
      }
    } else if (block.type === 'toolResult') {
      const targetId = typeof block.toolCallId === 'string' ? block.toolCallId : undefined;
      const text = typeof block.text === 'string' ? block.text : '';
      if (targetId && result.outputs.has(targetId)) {
        result.outputs.set(targetId, text);
      } else if (text && result.toolCalls.length > 0) {
        // Fallback: attach to the most recent tool call.
        const last = result.toolCalls[result.toolCalls.length - 1];
        result.outputs.set(last.id, text);
      }
    } else if (block.type === 'text') {
      if (typeof block.text === 'string') result.textParts.push(block.text);
    }
  }
  return result;
}

/** Map a raw omp JSONL entry of type "message" to the chamber shape. */
function toChatMessage(entry: OmpMessageEntry): ChatMessageData | null {
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
    const text = extractText(content);
    if (!text.trim()) return null;
    return { ...base, content: text };
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
  const message: ChatMessageData = {
    ...base,
    content: parsed.textParts.join('\n').trim(),
  };
  if (parsed.thinking) message.thinking = { thought: parsed.thinking, isGenerating: false };
  if (parsed.toolCalls.length > 0) {
    message.toolCalls = parsed.toolCalls.map((call) => ({
      ...call,
      output: parsed.outputs.get(call.id) || undefined,
      status: (msg.isError ? 'error' : 'success') as ToolCallData['status'],
    }));
  }
  if (!message.content && !message.thinking && !message.toolCalls?.length && !message.systemNote) {
    return null;
  }
  return message;
}

interface SequenceState {
  messages: ChatMessageData[];
  /** toolCallId → output text accumulated from later toolResult entries. */
  outputsByCall: Map<string, string>;
}

/**
 * First pass: collect every toolResult output (entry-level) into a map keyed
 * by toolCallId so assistant tool calls rendered later can show their result.
 */
function collectToolOutputs(records: Record<string, unknown>[]): Map<string, string> {
  const outputs = new Map<string, string>();
  for (const record of records) {
    if (record?.type !== 'message') continue;
    const msg = (record as unknown as OmpMessageEntry).message;
    if (!msg || msg.role !== 'toolResult') continue;
    const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
    if (!callId) continue;
    const text = resultOutput(msg);
    const existing = outputs.get(callId) ?? '';
    outputs.set(callId, existing ? `${existing}\n${text}` : text);
  }
  return outputs;
}

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
    if (record?.type !== 'message') continue;
    const mapped = toChatMessage(record as unknown as OmpMessageEntry);
    if (!mapped) continue;
    // Fold the collected outputs into this message's tool calls.
    if (mapped.toolCalls?.length) {
      mapped.toolCalls = mapped.toolCalls.map((call) => ({
        ...call,
        output: call.output || state.outputsByCall.get(call.id) || undefined,
      }));
    }
    state.messages.push(mapped);
  }
  return state.messages;
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
    const head = readFileSync(filePath, 'utf8').slice(0, 16 * 1024);
    const records = parseJsonlLenient<Record<string, unknown>>(head);
    const first = records[0];
    if (first?.type === 'title' && typeof first.title === 'string' && first.title.trim()) {
      return first.title;
    }
    const header = records.find((r) => r?.type === 'session');
    return typeof header?.title === 'string' && header.title.trim() ? header.title : undefined;
  } catch {
    return undefined;
  }
}
