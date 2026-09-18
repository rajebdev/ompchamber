/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { isRecord, parseJsonlLenient } from '@/lib/omp/session/jsonl';
import { formatNewSessionTitle } from '@/lib/omp/session/default-title';
import { contentProfile } from '@/lib/omp/session/telemetry-blocks';
import type {
  RawMessageInfo,
  RawMessageItem,
  SessionContextTelemetry,
} from '@/types/context';

const CONTEXT_LIMIT = 1_000_000;

interface OmpUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  /** Anchored prompt occupancy reported by the provider (never a per-turn total). */
  contextTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
}

interface OmpContextSnapshot {
  promptTokens?: number;
  /** Estimated prompt tokens removed by local history rewrites after the snapshot. */
  historyRewriteTokensRemoved?: number;
  nonMessageTokens?: number;
  compactionEpoch?: number;
}

export interface OmpMessage {
  role?: string;
  content?: unknown;
  model?: string;
  provider?: string;
  usage?: OmpUsage;
  contextSnapshot?: OmpContextSnapshot;
  stopReason?: string;
  isError?: boolean;
}

export interface SessionEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  cwd?: string;
  title?: string;
  shortSummary?: string;
  message?: OmpMessage;
}

/** Flatten an omp content value (string or block array) to plain text. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (typeof block.text === 'string') parts.push(block.text);
    else if (typeof block.thinking === 'string') parts.push(block.thinking);
  }
  return parts.join(' ').trim();
}

export function formatTs(ts: string | number | undefined): string {
  if (ts === undefined) return '';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCost(value: number): string {
  return value < 0.01 ? '$0.01' : `$${value.toFixed(2)}`;
}

export function tokensOf(usage: OmpUsage | undefined): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  total: number;
} {
  const input = usage?.input ?? 0;
  const output = usage?.output ?? 0;
  const cacheRead = usage?.cacheRead ?? 0;
  const cacheWrite = usage?.cacheWrite ?? 0;
  const reasoning = usage?.reasoningTokens ?? 0;
  const total = usage?.totalTokens ?? input + output + cacheRead + cacheWrite;
  return { input, output, cacheRead, cacheWrite, reasoning, total };
}

function contextAnchorTokens(msg: OmpMessage): number | undefined {
  const snapshot = msg.contextSnapshot;
  const usage = msg.usage;
  let promptTokens: number;
  if (snapshot?.promptTokens !== undefined) promptTokens = snapshot.promptTokens;
  else if (usage?.contextTokens !== undefined && usage.contextTokens > 0) promptTokens = usage.contextTokens;
  else if (usage) promptTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  else return undefined;
  if (promptTokens <= 0) return undefined;
  return Math.max(0, promptTokens - (snapshot?.historyRewriteTokensRemoved ?? 0));
}

export function buildInfo(
  entry: SessionEntry,
  msg: OmpMessage,
  cwd: string,
  index: number,
): RawMessageInfo {
  const usage = tokensOf(msg.usage);
  return {
    id: entry.id ?? `m${index}`,
    parentID: entry.parentId ?? undefined,
    role: msg.role === 'user' ? 'user' : 'assistant',
    path: { cwd, root: cwd },
    cost: msg.usage?.cost?.total ?? 0,
    tokens: { total: usage.total, input: usage.input, output: usage.output, reasoning: usage.reasoning, cache: { write: usage.cacheWrite, read: usage.cacheRead } },
    modelID: msg.provider && msg.model ? `${msg.provider}/${msg.model}` : '',
  };
}

function emptyTelemetry(sessionId: string, sessionTitle: string): SessionContextTelemetry {
  return {
    sessionId,
    sessionTitle,
    modelId: '',
    modelName: '',
    timestamp: '',
    contextUsed: 0,
    contextLimit: CONTEXT_LIMIT,
    contextPercent: 0,
    messagesCount: 0,
    userCount: 0,
    assistantCount: 0,
    totalCost: 0,
    costFormatted: '$0.01',
    lastMessage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cacheHitPercent: 0 },
    distribution: { userTokens: 0, userPercent: 0, assistantTokens: 0, assistantPercent: 0, toolTokens: 0, toolPercent: 0, otherTokens: 0, otherPercent: 100 },
    rawMessages: [],
  };
}

/** Streaming JSONL pass for the telemetry builders; `visit` returns `false` to stop early. */
export function scanSessionEntries(filePath: string, visit: (entry: SessionEntry, index: number) => boolean | void): void {
  let body: string;
  try {
    body = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const records = parseJsonlLenient<SessionEntry>(body);
  for (let index = 0; index < records.length; index++) {
    const entry = records[index];
    if (!entry) continue;
    if (visit(entry, index) === false) break;
  }
}

/**
 * Compute real `SessionContextTelemetry` for a session file (all-zero on
 * unreadable/empty). `rawLimit` caps materialized raw items (0 = none): the
 * panel reads full pages from `computeRawMessagesPage` in ./telemetry-raw.ts.
 */
export function computeRealSessionTelemetry(
  filePath: string,
  sessionId: string,
  fallbackTitle?: string,
  rawLimit = 0,
): SessionContextTelemetry {
  const defaultTitle = fallbackTitle || 'New Session';

  let header: SessionEntry | undefined;
  let userCount = 0;
  let assistantCount = 0;
  let userChars = 0;
  let assistantChars = 0;
  let toolChars = 0;
  let totalCost = 0;
  let contextAnchor = 0;
  let modelProvider = '';
  let modelId = '';
  let effectiveTitle = '';
  let shortSummary = '', firstUserText = '';
  let lastAsstUsage: OmpUsage | undefined;
  let sumInput = 0;
  let sumOutput = 0;
  let sumCacheRead = 0;
  let sumCacheWrite = 0;
  // Cache-hit average only counts warmed calls — any assistant call that read
  // zero cache tokens (cold request) is excluded, not just the very first one.
  let cacheAvgInput = 0;
  let cacheAvgCacheRead = 0;
  let costInput = 0;
  let costOutput = 0;
  let costCacheRead = 0;
  let costCacheWrite = 0;
  let messagesCount = 0;
  const rawMessages: RawMessageItem[] = [];
  let cwd = '';

  scanSessionEntries(filePath, (entry, index) => {
    // Modern session files start with a fixed-width title slot line, so the
    // header is never at index 0 when one exists. A filled slot (auto/user
    // rename) outranks the header's own title field.
    if (entry.type === 'title') {
      if (typeof entry.title === 'string' && entry.title.trim()) effectiveTitle = entry.title.trim();
      return;
    }
    if (entry.type === 'session' && !header) {
      header = entry;
      cwd = entry.cwd ?? '';
      if (!effectiveTitle && typeof entry.title === 'string') effectiveTitle = entry.title;
      return;
    }
    if (entry.type === 'compaction' && typeof entry.shortSummary === 'string' && !shortSummary) shortSummary = entry.shortSummary;
    if (entry.type !== 'message' || !entry.message) return;

    const msg = entry.message;
    const role = msg.role ?? '';
    const text = textOf(msg.content);
    const profile = contentProfile(msg.content);
    const info = buildInfo(entry, msg, cwd, index);
    const tokens = tokensOf(msg.usage);

    toolChars += profile.toolChars;

    if (role === 'user') {
      userCount++;
      userChars += text.length;
      if (!firstUserText && text.trim()) firstUserText = text.trim();
    } else if (role === 'assistant') {
      assistantCount++;
      assistantChars += text.length;
      if (msg.usage) lastAsstUsage = msg.usage;
      const anchor = contextAnchorTokens(msg);
      if (anchor !== undefined) contextAnchor = anchor;
    }

    if (msg.usage) {
      totalCost += msg.usage.cost?.total ?? 0;
      sumInput += tokens.input;
      sumOutput += tokens.output;
      sumCacheRead += tokens.cacheRead;
      sumCacheWrite += tokens.cacheWrite;
      if (msg.role === 'assistant' && tokens.cacheRead > 0) {
        cacheAvgInput += tokens.input;
        cacheAvgCacheRead += tokens.cacheRead;
      }
      costInput += msg.usage.cost?.input ?? 0;
      costOutput += msg.usage.cost?.output ?? 0;
      costCacheRead += msg.usage.cost?.cacheRead ?? 0;
      costCacheWrite += msg.usage.cost?.cacheWrite ?? 0;
    }
    if (msg.provider) modelProvider = msg.provider;
    if (msg.model) modelId = msg.model;

    if (role === 'user' || role === 'assistant') {
      messagesCount++;
      if (rawLimit === 0 || rawMessages.length < rawLimit) {
        const isAssistant = role === 'assistant';
        const snippet = text.slice(0, 70);
        rawMessages.push({
          id: entry.id ?? `m${index}`,
          type: isAssistant ? (profile.parts.length ? profile.parts.join('_') : 'text') : 'user',
          badgeLabel: isAssistant
            ? (profile.parts.length ? profile.parts.join(' + ') : 'text')
            : `user: ${snippet}${text.length > 70 ? '...' : ''}`,
          tokenSummary: isAssistant
            ? `${tokens.input.toLocaleString()} / ${tokens.output.toLocaleString()}`
            : '',
          timestamp: formatTs(entry.timestamp),
          info,
          rawPayload: entry as unknown as Record<string, any>,
        });
      }
    }
  });

  if (messagesCount === 0 && !header && !effectiveTitle) return emptyTelemetry(sessionId, defaultTitle);

  const providerModel = modelProvider && modelId ? `${modelProvider}/${modelId}` : '';
  const contextUsed = contextAnchor;
  const contextPercent = Math.min(100, Math.max(0, Number(((contextUsed / CONTEXT_LIMIT) * 100).toFixed(1))));

  // Distribution: real token categories (input→user, output→assistant, cacheWrite→tool, cacheRead→other); char fallback when no usage.
  const hasUsage = sumInput + sumOutput + sumCacheRead + sumCacheWrite > 0;
  const userTokens = hasUsage ? sumInput : userChars;
  const assistantTokens = hasUsage ? sumOutput : assistantChars;
  const toolTokens = hasUsage ? sumCacheWrite : toolChars;
  const otherTokens = hasUsage ? sumCacheRead : 0;
  const grand = Math.max(1, userTokens + assistantTokens + toolTokens + otherTokens);
  const userPercent = Math.max(0, Math.round((userTokens / grand) * 100));
  const assistantPercent = Math.max(0, Math.round((assistantTokens / grand) * 100));
  const toolPercent = Math.max(0, Math.round((toolTokens / grand) * 100));
  const otherPercent = Math.max(0, 100 - userPercent - assistantPercent - toolPercent);

  const lastTokens = tokensOf(lastAsstUsage);
  const cacheHitPercent = lastAsstUsage && lastTokens.input + lastTokens.output + lastTokens.cacheRead > 0 ? Number(((lastTokens.cacheRead / (lastTokens.input + lastTokens.output + lastTokens.cacheRead)) * 100).toFixed(1)) : 0;
  const cacheHitAverage = cacheAvgInput + cacheAvgCacheRead > 0 ? Number(((cacheAvgCacheRead / (cacheAvgInput + cacheAvgCacheRead)) * 100).toFixed(1)) : 0;

  return {
    sessionId,
    sessionTitle: effectiveTitle || shortSummary || firstUserText
      || (header?.timestamp ? formatNewSessionTitle(new Date(header.timestamp)) : defaultTitle),
    modelId: providerModel,
    modelName: providerModel,
    timestamp: formatTs(header?.timestamp),
    contextUsed,
    contextLimit: CONTEXT_LIMIT,
    contextPercent,
    messagesCount,
    userCount,
    assistantCount,
    totalCost,
    costFormatted: formatCost(totalCost),
    cacheHitAverage,
    costBreakdown: { input: costInput, output: costOutput, cacheRead: costCacheRead, cacheWrite: costCacheWrite, total: totalCost },
    lastMessage: {
      input: lastTokens.input,
      output: lastTokens.output,
      reasoning: lastTokens.reasoning,
      cacheRead: lastTokens.cacheRead,
      cacheWrite: lastTokens.cacheWrite,
      cacheHitPercent,
    },
    distribution: {
      userTokens,
      userPercent,
      assistantTokens,
      assistantPercent,
      toolTokens,
      toolPercent,
      otherTokens,
      otherPercent,
    },
    // Held to `rawLimit` items — the panel pages via computeRawMessagesPage.
    rawMessages,
  };
}
