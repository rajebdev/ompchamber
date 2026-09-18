/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-session enrichment for the session browser: model history, thinking
 * levels, compaction events, and token/cost rollups parsed from a session
 * jsonl file (v3 format — see docs in lib/omp/session).
 */

import { readFileSync, statSync } from 'fs';
import { parseJsonlLenient } from '@/shared/lib/omp/session/jsonl';

interface OmpUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
}

interface StatEntry {
  type?: string;
  timestamp?: string;
  model?: string;
  thinkingLevel?: string;
  message?: { role?: string; model?: string; provider?: string; usage?: OmpUsage };
}

export interface SessionStats {
  /** Model switch history (most settings tabs show only the latest). */
  models: Array<{ model: string; at: string }>;
  thinkingLevels: Array<{ level: string; at: string }>;
  compactions: number;
  messageCount: number;
  assistantMessageCount: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number };
  cost: { total: number };
  /** First and last entry timestamps (ISO) when present. */
  startedAt?: string;
  lastActivityAt?: string;
}

const MAX_SESSION_BYTES = 64 * 1024 * 1024;

export function readSessionStats(filePath: string): SessionStats | undefined {
  try {
    if (statSync(filePath).size > MAX_SESSION_BYTES) return undefined;
    const entries = parseJsonlLenient<StatEntry>(readFileSync(filePath, 'utf8'));
    const stats: SessionStats = {
      models: [],
      thinkingLevels: [],
      compactions: 0,
      messageCount: 0,
      assistantMessageCount: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
      cost: { total: 0 },
    };
    for (const entry of entries) {
      const ts = typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
      if (ts) {
        stats.startedAt ??= ts;
        stats.lastActivityAt = ts;
      }
      switch (entry.type) {
        case 'model_change':
          if (typeof entry.model === 'string' && ts) stats.models.push({ model: entry.model, at: ts });
          break;
        case 'thinking_level_change':
          if (typeof entry.thinkingLevel === 'string' && ts) stats.thinkingLevels.push({ level: entry.thinkingLevel, at: ts });
          break;
        case 'compaction':
          stats.compactions++;
          break;
        case 'message': {
          const message = entry.message;
          if (!message) break;
          stats.messageCount++;
          if (message.role === 'assistant') stats.assistantMessageCount++;
          const usage = message.usage;
          if (usage) {
            stats.tokens.input += usage.input ?? 0;
            stats.tokens.output += usage.output ?? 0;
            stats.tokens.cacheRead += usage.cacheRead ?? 0;
            stats.tokens.cacheWrite += usage.cacheWrite ?? 0;
            stats.tokens.reasoning += usage.reasoningTokens ?? 0;
            stats.cost.total += usage.cost?.total ?? 0;
          }
          break;
        }
        default:
          break;
      }
    }
    return stats;
  } catch {
    return undefined;
  }
}
