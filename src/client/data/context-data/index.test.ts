/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import { computeSessionContextTelemetry } from '@/client/data/context-data';

const CONTEXT_LIMIT = 1_000_000;

interface MockMessage {
  id: string;
  role: string;
  content: string;
  date: string;
}

function userMessage(id: string, content: string): MockMessage {
  return { id, role: 'user', content, date: '9/16, 10:00 AM' };
}

function assistantMessage(id: string, content: string): MockMessage {
  return { id, role: 'ai', content, date: '9/16, 10:01 AM' };
}

function assistantAnchors(telemetry: ReturnType<typeof computeSessionContextTelemetry>) {
  return telemetry.rawMessages
    .filter((m) => m.info.role === 'assistant')
    .map((m) => ({
      anchor: m.info.tokens.input + m.info.tokens.cache.read + m.info.tokens.cache.write,
      cacheRead: m.info.tokens.cache.read,
      total: m.info.tokens.total,
    }));
}

describe('computeSessionContextTelemetry context anchor', () => {
  test('contextUsed is the latest assistant prompt estimate, not cumulative session totals', () => {
    const telemetry = computeSessionContextTelemetry('ses_anchor', 'Anchor Session', [
      userMessage('u1', 'first question'),
      assistantMessage('a1', 'first answer'),
      userMessage('u2', 'second question'),
      assistantMessage('a2', 'second answer that is considerably longer'),
    ]);

    const anchors = assistantAnchors(telemetry);
    const latest = anchors[anchors.length - 1];
    const cumulative = anchors.reduce((sum, a) => sum + a.total, 0);

    expect(latest).toBeDefined();
    expect(telemetry.contextUsed).toBe(latest.anchor);
    expect(telemetry.contextUsed).toBeLessThan(cumulative);
  });

  test('distribution.otherTokens is the cumulative cacheRead across the session', () => {
    const telemetry = computeSessionContextTelemetry('ses_other', 'Other Session', [
      userMessage('u1', 'first question'),
      assistantMessage('a1', 'first answer'),
      userMessage('u2', 'second question'),
      assistantMessage('a2', 'second answer that is considerably longer'),
    ]);

    const cumulativeCacheRead = assistantAnchors(telemetry).reduce((sum, a) => sum + a.cacheRead, 0);

    expect(cumulativeCacheRead).toBeGreaterThan(0);
    expect(telemetry.distribution.otherTokens).toBe(cumulativeCacheRead);
  });

  test('fabricates no occupancy when the session has no assistant messages', () => {
    const telemetry = computeSessionContextTelemetry('ses_user_only', 'User Only', [
      userMessage('u1', 'a question with no answer yet'),
    ]);

    expect(telemetry.contextUsed).toBe(0);
    expect(telemetry.contextPercent).toBe(0);
  });

  test('derives contextPercent from the anchor and clamps it to [0, 100]', () => {
    const telemetry = computeSessionContextTelemetry('ses_clamp', 'Clamp Session', [
      userMessage('u1', 'one very large prompt'),
      assistantMessage('a1', 'x'.repeat(120_000)),
    ]);

    expect(telemetry.contextUsed).toBeGreaterThan(CONTEXT_LIMIT);
    expect(telemetry.contextPercent).toBe(100);
    expect(telemetry.contextPercent).toBeGreaterThanOrEqual(0);
    expect(telemetry.contextPercent).toBeLessThanOrEqual(100);
  });
});
