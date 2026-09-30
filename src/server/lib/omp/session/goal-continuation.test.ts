/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The auto-continuation guards.
 *
 * The loop lives inside the child (only the extension can send a HIDDEN turn —
 * an RPC prompt would leave a "Continue active goal." bubble in the transcript
 * on every iteration), so what the chamber owns is the decision data it feeds
 * that loop. These are the rules that keep a goal from running forever.
 */

import { describe, expect, test } from 'bun:test';
import { continuationDecision, type ContinuationInput } from '@/server/lib/omp/session/goal-continuation';

const base: ContinuationInput = {
  enabled: true,
  status: 'active',
  tokensUsed: 10,
  tokenBudget: 100,
  turns: 0,
  maxTurns: 25,
  autoContinue: true,
  userStopped: false,
};

function decide(overrides: Partial<ContinuationInput> = {}) {
  return continuationDecision({ ...base, ...overrides });
}

describe('continuationDecision', () => {
  test('continues an active goal with budget left', () => {
    expect(decide()).toEqual({ continue: true, reason: 'active' });
  });

  test('stops when automatic continuation is off', () => {
    expect(decide({ autoContinue: false })).toEqual({ continue: false, reason: 'auto-continue-disabled' });
  });

  test('stops a paused, complete or dropped goal', () => {
    for (const status of ['paused', 'complete', 'dropped'] as const) {
      expect(decide({ status })).toEqual({ continue: false, reason: 'not-active' });
    }
  });

  test('stops when the token budget is exhausted', () => {
    expect(decide({ tokensUsed: 100, tokenBudget: 100 })).toEqual({ continue: false, reason: 'budget-exhausted' });
    expect(decide({ tokensUsed: 150, tokenBudget: 100 })).toEqual({ continue: false, reason: 'budget-exhausted' });
  });

  test('no budget means the turn ceiling is the only guard', () => {
    expect(decide({ tokenBudget: undefined, turns: 24 })).toEqual({ continue: true, reason: 'active' });
    expect(decide({ tokenBudget: undefined, turns: 25 })).toEqual({ continue: false, reason: 'max-turns' });
  });

  test('the turn ceiling stops a budgetless goal', () => {
    expect(decide({ turns: 25 })).toEqual({ continue: false, reason: 'max-turns' });
  });

  test('a user Stop wins over everything', () => {
    // Stop means stop: the operator ended the turn, and re-opening it
    // immediately would make the button a lie.
    expect(decide({ userStopped: true })).toEqual({ continue: false, reason: 'user-stopped' });
  });

  test('budget-limited is a stop, not a continue', () => {
    // omp sends its own wrap-up turn in that state; adding another would
    // double the request the operator already saw.
    expect(decide({ status: 'budget-limited' })).toEqual({ continue: false, reason: 'not-active' });
  });
});
