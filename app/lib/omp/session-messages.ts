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
import { parseJsonlLenient } from '@/lib/omp/session-jsonl';
import { normalizeNoticePositions } from '@/lib/chat-order';
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
    stopReason?: string;
    errorStatus?: number;
    errorId?: number;
    errorMessage?: string;
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
  if (lower.includes('grep') || lower.includes('glob')) return 'grep';
  if (lower.includes('search') || lower.includes('find')) return 'search_fs';
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('http')) return 'web_search';
  if (lower.includes('todo')) return 'todo';
  if (lower.includes('task')) return 'task';
  if (lower.includes('lsp')) return 'lsp';
  if (lower.includes('eval')) return 'eval';
  if (lower.includes('github')) return 'github';
  if (lower.includes('security')) return 'security_scan';
  return 'custom';
}

function toolTitleFor(block: OmpBlock): string {
  const name = typeof block.name === 'string' ? block.name : 'tool';
  const detail = commandFor(block) || targetFor(block);
  return detail ? `${name} — ${detail}` : name;
}

function targetFor(block: OmpBlock): string | undefined {
  if (!isRecord(block.arguments)) return undefined;
  const args = block.arguments;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.TargetFile === 'string') return args.TargetFile;
  if (typeof args.targetFile === 'string') return args.targetFile;
  if (typeof args.FilePath === 'string') return args.FilePath;
  if (typeof args.filePath === 'string') return args.filePath;
  if (typeof args.AbsolutePath === 'string') return args.AbsolutePath;
  if (typeof args.file === 'string') return args.file;
  return undefined;
}

function commandFor(block: OmpBlock): string | undefined {
  if (!isRecord(block.arguments)) return undefined;
  const args = block.arguments;
  if (typeof args.command === 'string') return args.command;
  if (typeof args.cmd === 'string') return args.cmd;
  if (typeof args.CommandLine === 'string') return args.CommandLine;
  if (typeof args.commandLine === 'string') return args.commandLine;
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

/** Extract image blocks from an omp user content array ({type:'image',
 *  data: base64, mimeType}) into ChatMessageData attachment entries so the
 *  timeline keeps showing them after a reload from the session JSONL. */
function extractUserImageAttachments(
  content: unknown,
): { id: string; name: string; preview: string; type: string }[] {
  if (!Array.isArray(content)) return [];
  const attachments: { id: string; name: string; preview: string; type: string }[] = [];
  let index = 0;
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'image') continue;
    const data = typeof block.data === 'string' ? block.data : undefined;
    const mimeType = typeof block.mimeType === 'string' ? block.mimeType : 'image/png';
    if (!data) continue;
    index += 1;
    const ext = (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
    attachments.push({
      id: `att-${index}`,
      name: `attachment-${index}.${ext}`,
      preview: `data:${mimeType};base64,${data}`,
      type: mimeType,
    });
  }
  return attachments;
}

/** Strip the inlined "Attached file: ..." fenced blocks that the composer
 *  appends to the prompt before sending (mirror omp-web). The JSONL stores
 *  the composed prompt; the timeline should show the original text only —
 *  the file itself renders as an attachment chip. Handles both a leading
 *  block (attach-only prompt) and one appended after the user text. */
function stripInlinedTextAttachments(text: string): string {
  const match = text.match(/(?:^|\n{2})\s*Attached file: /);
  if (!match || match.index === undefined) return text;
  const before = text.slice(0, match.index);
  const rest = text.slice(match.index + match[0].length);
  if (!/^[^\n]+\n```[a-z]*\n/.test(rest)) return text;
  return before.trim();
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
  /** Short human intent (omp arguments.i) for the tool calls in this turn. */
  intent?: string;
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
        const intent =
          isRecord(block.arguments) && typeof block.arguments.i === 'string'
            ? (block.arguments.i as string)
            : undefined;
        if (intent && !result.intent) result.intent = intent;
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

interface CollectedToolResult {
  output: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

interface SequenceState {
  messages: ChatMessageData[];
  /** toolCallId → output and details accumulated from later toolResult entries. */
  outputsByCall: Map<string, CollectedToolResult>;
}

/**
 * First pass: collect every toolResult output (entry-level) into a map keyed
 * by toolCallId so assistant tool calls rendered later can show their result.
 */
function collectToolOutputs(records: Record<string, unknown>[]): Map<string, CollectedToolResult> {
  const outputs = new Map<string, CollectedToolResult>();
  for (const record of records) {
    if (record?.type !== 'message') continue;
    const msg = (record as unknown as OmpMessageEntry).message;
    if (!msg || msg.role !== 'toolResult') continue;
    const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined;
    if (!callId) continue;
    const text = resultOutput(msg);
    const existing = outputs.get(callId);
    const output = existing ? `${existing.output}\n${text}` : text;
    const details = (isRecord(msg.details) ? (msg.details as Record<string, unknown>) : undefined) || existing?.details;
    const isError = msg.isError === true || existing?.isError;
    outputs.set(callId, { output, details, isError });
  }
  return outputs;
}

/** Map an omp `custom_message` entry (ultrathink-notice, xdev-mount-notice,
 *  ...) to a notice row. Returns null for non-notice custom messages. */
function noticeFromCustomMessage(record: Record<string, unknown>): ChatMessageData | null {
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
    if (record?.type === 'custom_message') {
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
