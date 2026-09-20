/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source of truth for parsing omp message content blocks (text /
 * thinking / toolCall / toolResult) into the chamber's parsed-message shape.
 *
 * Both render paths share this core so their behavior can never drift:
 * - live SSE events:  hooks/chat/omp/stream.ts → mapper.ts (streaming=true)
 * - JSONL reload:     lib/omp/session/messages-parse.ts → messages-map.ts
 *
 * The two adapters only handle what is genuinely path-specific: the entry
 * wrapper shape, the streaming status of tool calls, and output pairing
 * (incremental in live, 2-pass on reload).
 */

import type { ToolCallData, ToolType } from '@/shared/types/chat';
import { hashlineTargetPath } from '@/shared/lib/omp/session/hashline-patch';
import { isRecord } from '@/shared/lib/util/guards';

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n');
}

export interface ParsedToolCall {
  id: string;
  name: string;
  title: string;
  intent?: string;
  target?: string;
  command?: string;
  input?: string | Record<string, unknown>;
}

export interface ParsedMessageBlocks {
  thinking?: string;
  toolCalls: ParsedToolCall[];
  /** toolCallId → text output carried by inline toolResult blocks. */
  inlineOutputs: Map<string, string>;
  textParts: string[];
  /** Short human intent (omp arguments.i) for the tool calls in this turn. */
  intent?: string;
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

export { inferToolType };

function stringArg(rawInput: Record<string, unknown> | undefined, keys: string[]): string {
  if (!rawInput) return '';
  for (const key of keys) {
    const value = rawInput[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

const COMMAND_KEYS = ['command', 'cmd', 'CommandLine', 'commandLine'];
const TARGET_KEYS = ['path', 'TargetFile', 'targetFile', 'FilePath', 'filePath', 'AbsolutePath', 'file'];

/** Parse omp message content (string or block array) into the canonical
 *  parsed-message shape shared by the live and reload render paths. */
export function parseMessageBlocks(content: unknown): ParsedMessageBlocks {
  const result: ParsedMessageBlocks = { toolCalls: [], inlineOutputs: new Map(), textParts: [] };
  if (typeof content === 'string') {
    result.textParts.push(content);
    return result;
  }
  if (!Array.isArray(content)) return result;

  for (const raw of content) {
    if (!isRecord(raw)) continue;
    const block = raw as {
      type?: unknown;
      text?: unknown;
      thinking?: unknown;
      id?: unknown;
      name?: unknown;
      toolCallId?: unknown;
      arguments?: unknown;
      input?: unknown;
    };
    if (block.type === 'thinking') {
      if (typeof block.thinking === 'string') result.thinking = block.thinking;
      else if (typeof block.text === 'string') result.thinking = block.text;
    } else if (block.type === 'toolCall') {
      const id = typeof block.id === 'string' ? block.id : `tool-${Math.random().toString(36).slice(2, 10)}`;
      const name = typeof block.name === 'string' ? block.name : 'tool';
      const rawInput = (block.arguments ?? block.input) as Record<string, unknown> | undefined;
      const args = isRecord(rawInput) ? rawInput : undefined;
      const command = stringArg(args, COMMAND_KEYS);
      // An omp `edit` carries its target inside the patch header (`input:
      // "[PATH#TAG]\nCUT …"`) — no `path` key — so the card would otherwise
      // render without a file name until the result's `details.path` arrives.
      const target = stringArg(args, TARGET_KEYS) || (args ? hashlineTargetPath(args) : undefined);
      const intent = typeof args?.i === 'string' ? args.i : undefined;
      const detail = command || target;
      result.toolCalls.push({
        id,
        name,
        title: detail ? `${name} — ${detail}` : name,
        intent,
        target: target || undefined,
        command: command || undefined,
        input: args && Object.keys(args).length > 0 ? args : undefined,
      });
      if (intent && !result.intent) result.intent = intent;
      result.inlineOutputs.set(id, '');
    } else if (block.type === 'toolResult') {
      const targetId = typeof block.toolCallId === 'string' ? block.toolCallId : undefined;
      const text = typeof block.text === 'string' ? block.text : '';
      if (targetId && result.inlineOutputs.has(targetId)) {
        result.inlineOutputs.set(targetId, text);
      } else if (text && result.toolCalls.length > 0) {
        const last = result.toolCalls[result.toolCalls.length - 1];
        result.inlineOutputs.set(last.id, text);
      }
    } else if (block.type === 'text') {
      if (typeof block.text === 'string') result.textParts.push(block.text);
    }
  }
  return result;
}

/** Build a chamber ToolCallData from the parsed core shape. `streaming`
 *  controls the initial status (live calls start 'running'); pairing an
 *  output after the fact overrides it back to success/error. */
export function toToolCallData(
  parsed: ParsedToolCall,
  options: { streaming: boolean; output?: string; isError?: boolean },
): ToolCallData {
  const input = parsed.input;
  const stripped = isRecord(input)
    ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'i'))
    : input;
  const status: ToolCallData['status'] = options.isError
    ? 'error'
    : options.output !== undefined
      ? 'success'
      : options.streaming ? 'running' : 'success';
  return {
    id: parsed.id,
    type: inferToolType(parsed.name),
    name: parsed.name,
    title: parsed.title,
    intent: parsed.intent,
    target: parsed.target,
    command: parsed.command,
    input: stripped && Object.keys(stripped).length > 0 ? stripped : undefined,
    output: options.output,
    status,
  };
}

/** Extract image blocks from an omp user content array ({type:'image',
 *  data: base64, mimeType}) into ChatMessageData attachment entries so the
 *  timeline keeps showing them after a reload from the session JSONL. */
export function extractUserImageAttachments(
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
export function stripInlinedTextAttachments(text: string): string {
  const match = text.match(/(?:^|\n{2})\s*Attached file: /);
  if (!match || match.index === undefined) return text;
  const before = text.slice(0, match.index);
  const rest = text.slice(match.index + match[0].length);
  if (!/^[^\n]+\n```[a-z]*\n/.test(rest)) return text;
  return before.trim();
}
