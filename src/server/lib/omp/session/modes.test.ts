/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The persisted mode reader.
 *
 * It is what makes a reload honest: the composer's toggles are restored from
 * the session's own JSONL, not from a client cache, so a session reopened in
 * another tab — or driven by the CLI — shows the modes it is actually in. The
 * rules below are the ones a naive "last entry wins" read gets wrong.
 */

import { describe, expect, test } from 'bun:test';
import { readPersistedModes } from '@/server/lib/omp/session/modes';

const line = (customType: string, data: unknown) => JSON.stringify({ type: 'custom', customType, data });

describe('readPersistedModes', () => {
  test('reports nothing for a session with no mode entries', () => {
    const body = JSON.stringify({ type: 'message', message: { role: 'user', content: 'hi' } });
    expect(readPersistedModes(body)).toEqual({ plan: false, goal: false, goalLive: false, goalRecord: null });
  });

  test('takes the LAST transition, not the first', () => {
    const body = [line('chamber-plan-state', { enabled: true }), line('chamber-plan-state', { enabled: false })].join('\n');
    expect(readPersistedModes(body).plan).toBe(false);
  });

  test('goalLive is true only for an ACTIVE goal', () => {
    // The distinction that decides whether a cold spawn arms the continuation
    // loop: a paused goal exists (the toggle reads as on) but is not being
    // pursued, and omp's own cold-start pause must not be overridden.
    const active = line('chamber-goal-state', {
      enabled: true,
      goal: { id: 'g1', objective: 'x', status: 'active', tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
    });
    const paused = line('chamber-goal-state', {
      enabled: true,
      goal: { id: 'g1', objective: 'x', status: 'paused', tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
    });
    expect(readPersistedModes(active).goalLive).toBe(true);
    expect(readPersistedModes(paused).goalLive).toBe(false);
    expect(readPersistedModes(paused).goal).toBe(true);
  });

  test('keeps a goal live across paused and budget-limited', () => {
    for (const status of ['active', 'paused', 'budget-limited'] as const) {
      const body = line('chamber-goal-state', {
        enabled: true,
        goal: { id: 'g1', objective: 'x', status, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
      });
      expect(readPersistedModes(body).goal).toBe(true);
    }
  });

  test('a completed or dropped goal does not read as on', () => {
    for (const status of ['complete', 'dropped'] as const) {
      const body = line('chamber-goal-state', {
        enabled: false,
        goal: { id: 'g1', objective: 'x', status, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
      });
      const parsed = readPersistedModes(body);
      expect(parsed.goal).toBe(false);
      // The record survives: the composer shows what the goal WAS.
      expect(parsed.goalRecord?.status).toBe(status);
    }
  });

  test('an enabled flag without a live status is not enough', () => {
    // omp writes `enabled: true` with `mode: "exiting"` on completion; the
    // status is what decides.
    const body = line('chamber-goal-state', {
      enabled: true,
      goal: { id: 'g1', objective: 'x', status: 'complete', tokensUsed: 1, timeUsedSeconds: 1, createdAt: 0, updatedAt: 0 },
    });
    expect(readPersistedModes(body).goal).toBe(false);
  });

  test('ignores a malformed line rather than throwing', () => {
    const body = ['{not json', line('chamber-plan-state', { enabled: true })].join('\n');
    expect(readPersistedModes(body).plan).toBe(true);
  });
});
