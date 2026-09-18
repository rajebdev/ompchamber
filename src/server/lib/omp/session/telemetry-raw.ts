/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-side pagination for the raw messages panel. Scans the session JSONL
 * like ./telemetry.ts but materializes at most one page of `RawMessageItem`s,
 * so the payload-heavy entries never leave the server in bulk.
 */

import type { RawMessageItem } from '@/shared/types/context';
import { buildInfo, formatTs, scanSessionEntries, textOf, tokensOf, type OmpMessage, type SessionEntry } from '@/server/lib/omp/session/telemetry';
import { contentProfile } from '@/shared/lib/omp/session/telemetry-blocks';

export type RawMessageRole = 'all' | 'assistant' | 'user';

export interface RawMessagesPage {
  items: RawMessageItem[];
  total: number;
  filteredTotal: number;
}

/**
 * Read one page of raw messages, newest-first. The scan keeps a sliding
 * window of the last `page * pageSize` matches and slices its tail, so
 * server memory stays O(page) regardless of session length.
 */
export function computeRawMessagesPage(
  filePath: string,
  page: number,
  pageSize: number,
  role: RawMessageRole = 'all',
): RawMessagesPage {
  const windowSize = Math.max(1, page) * pageSize;
  const window: RawMessageItem[] = [];
  let total = 0;
  let filteredTotal = 0;
  let header: SessionEntry | undefined;

  scanSessionEntries(filePath, (entry, index) => {
    if (entry.type === 'session' && !header) {
      header = entry;
      return;
    }
    if (entry.type !== 'message' || !entry.message) return;

    const msg = entry.message;
    // Match computeRealSessionTelemetry: only user/assistant messages are raw
    // panel items — toolResult entries are bookkeeping, not listed.
    if (msg.role !== 'assistant' && msg.role !== 'user') return;
    const msgRole: 'assistant' | 'user' = msg.role;
    total++;
    if (role !== 'all' && msgRole !== role) return;
    filteredTotal++;

    if (window.length >= windowSize) window.shift();
    window.push(buildRawItem(entry, msg, header?.cwd ?? '', index));
  });

  // `window` holds the last `windowSize` matches, oldest→newest, where
  // windowSize = page * pageSize. Page N is the Nth-newest chunk of pageSize
  // rows: skip the (page-1) newest chunks, take one, flip for display. Both
  // bounds clamp at 0 so out-of-range pages return an empty list.
  const skipNewest = (Math.max(1, page) - 1) * pageSize;
  const end = Math.max(0, window.length - skipNewest);
  const start = Math.max(0, end - pageSize);
  const items = window.slice(start, end).reverse();
  return { items, total, filteredTotal };
}

function buildRawItem(
  entry: SessionEntry,
  msg: OmpMessage,
  cwd: string,
  index: number,
): RawMessageItem {
  const isAssistant = msg.role === 'assistant';
  const text = textOf(msg.content);
  const profile = contentProfile(msg.content);
  const snippet = text.slice(0, 70);
  const tokens = tokensOf(msg.usage);
  return {
    id: entry.id ?? `m${index}`,
    type: isAssistant ? (profile.parts.length ? profile.parts.join('_') : 'text') : 'user',
    badgeLabel: isAssistant
      ? (profile.parts.length ? profile.parts.join(' + ') : 'text')
      : `user: ${snippet}${text.length > 70 ? '...' : ''}`,
    tokenSummary: isAssistant
      ? `${tokens.input.toLocaleString()} / ${tokens.output.toLocaleString()}`
      : '',
    timestamp: formatTs(entry.timestamp),
    info: buildInfo(entry, msg, cwd, index),
    rawPayload: entry as unknown as Record<string, any>,
  };
}
