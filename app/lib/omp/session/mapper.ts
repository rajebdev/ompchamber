/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mapping helpers between the omp agent event/message stream and the chamber
 * ChatMessageData shape used by the chat timeline. Kept outside useOmpAgent so
 * the hook only owns SSE + RPC lifecycle.
 */

import type { ChatMessageData, ToolCallData } from '@/types';

/** Extract plain text from omp content (string or [{type:'text',text},...]). */
export function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
}

/** Tool events carry result/partialResult as a string or as an omp content
 *  block ({content:[{type:'text',text}]}) — normalize both to plain text. */
export function toolResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const content = (value as { content?: unknown }).content;
    return extractTextFromContent(content);
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
    const content = raw.content;
    let text = '';
    let thinking: ChatMessageData['thinking'];
    let toolCalls: ChatMessageData['toolCalls'];
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      const blocks: (ToolCallData & { _toolCallId?: string })[] = [];
      const thoughtParts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as { type?: unknown; text?: unknown; thinking?: unknown; toolCallId?: unknown; toolName?: unknown; name?: unknown; id?: unknown; input?: unknown; arguments?: unknown; duration?: unknown; durationMs?: unknown; isError?: unknown; details?: unknown };
        if (b.type === 'text' && typeof b.text === 'string') {
          text += b.text;
        } else if (b.type === 'thinking') {
          if (typeof b.thinking === 'string') thoughtParts.push(b.thinking);
          else if (typeof b.text === 'string') thoughtParts.push(b.text);
        } else if (b.type === 'toolCall') {
          const tcId = typeof b.toolCallId === 'string' ? b.toolCallId : (typeof b.id === 'string' ? b.id : `tc-${Date.now()}`);
          const toolName = typeof b.toolName === 'string' ? b.toolName : (typeof b.name === 'string' ? b.name : 'Tool');
          const rawInput = (b.input ?? b.arguments) as Record<string, unknown> | undefined;
          const command =
            rawInput && typeof rawInput.command === 'string'
              ? rawInput.command
              : rawInput && typeof rawInput.cmd === 'string'
                ? rawInput.cmd
                : rawInput && typeof rawInput.CommandLine === 'string'
                  ? rawInput.CommandLine
                  : '';
          const target =
            rawInput && typeof rawInput.path === 'string'
              ? rawInput.path
              : rawInput && typeof rawInput.TargetFile === 'string'
                ? rawInput.TargetFile
                : rawInput && typeof rawInput.targetFile === 'string'
                  ? rawInput.targetFile
                  : rawInput && typeof rawInput.file === 'string'
                    ? rawInput.file
                    : '';
          blocks.push({
            id: tcId,
            type: toolName as ToolCallData['type'],
            title: command || target ? `${toolName} — ${command || target}` : toolName,
            name: toolName,
            intent: rawInput && typeof rawInput.i === 'string' ? rawInput.i : undefined,
            target,
            command,
            input: rawInput,
            status: streaming ? 'running' : 'success',
          });
        } else if (b.type === 'toolResult') {
          const targetId = typeof b.toolCallId === 'string' ? b.toolCallId : undefined;
          const resultText = typeof b.text === 'string' ? b.text : '';
          const found = blocks.find(tc => tc._toolCallId === targetId) ?? blocks[blocks.length - 1];
          if (found) {
            found.output = resultText;
            found.status = 'success';
            if (typeof b.duration === 'string') found.duration = b.duration;
            if (typeof b.durationMs === 'number') found.durationMs = b.durationMs;
            if (b.isError === true) {
              found.isError = true;
              found.status = 'error';
            }
            if (b.details && typeof b.details === 'object') {
              found.details = b.details as Record<string, any>;
              if ((b.details as Record<string, unknown>).__synthetic === true) {
                found.synthetic = true;
                found.status = 'skipped';
              }
            }
          }
        }
      }
      blocks.forEach((tc) => { delete tc._toolCallId; });
      if (thoughtParts.length) thinking = { thought: thoughtParts.join('\n'), isGenerating: streaming };
      if (blocks.length) toolCalls = blocks;
    }
  const id = typeof raw.id === 'string' ? raw.id : `msg-${raw.timestamp ?? Date.now()}-ai`;
  const role = raw.role === 'user' ? 'user' : 'ai';
  const timestamp = typeof raw.timestamp === 'number' ? new Date(raw.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined;
  return {
    id,
    role,
    date: timestamp ? `Today, ${timestamp}` : undefined,
    timestamp,
    content: text,
    thinking: thinking ?? (raw.thinking as ChatMessageData['thinking']),
    toolCalls: toolCalls ?? (raw.toolCalls as ChatMessageData['toolCalls']),
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    error: raw.error as ChatMessageData['error'],
  };
}
