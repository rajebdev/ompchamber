/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMessageData, ToolCallData, ToolType } from '@/types/chat';

type Role = ChatMessageData['role'];

interface OmpBlock {
  type?: string;
  [key: string]: unknown;
}

export interface OmpMessageEntry {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

export function roleFor(role: string | undefined): Role {
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

/** Strip a toolResult's text into a plain output string (skip binary/refusal). */
export function resultOutput(message: OmpMessageEntry['message']): string {
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

export function parseAssistantContent(content: unknown): ParsedBlocks {
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
