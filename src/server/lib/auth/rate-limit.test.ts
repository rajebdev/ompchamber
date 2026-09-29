/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The login attempt budget.
 *
 * The behaviours worth pinning are the ones a refactor would plausibly invert:
 * a lockout that does not lift, a window that never resets, and an
 * unidentifiable caller getting a fresh budget per request instead of sharing
 * the small one.
 */

import { beforeEach, describe, expect, test } from 'bun:test';

import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  RATE_LIMIT_LOCKOUT_MS,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_UNKNOWN_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
  recordLoginFailure,
  resetLoginRateLimits,
  UNKNOWN_CLIENT_KEY,
} from '@/server/lib/auth/rate-limit';

const NOW = 1_700_000_000_000;

beforeEach(() => resetLoginRateLimits());

describe('login rate limit', () => {
  test('allows attempts up to the budget, then locks the address out', () => {
    for (let attempt = 1; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      expect(recordLoginFailure('1.2.3.4', NOW).allowed).toBe(true);
    }
    // The attempt that spends the budget trips the lockout and is itself refused.
    const tripped = recordLoginFailure('1.2.3.4', NOW);
    expect(tripped.allowed).toBe(false);
    expect(tripped.retryAfterSec).toBe(RATE_LIMIT_LOCKOUT_MS / 1000);

    const checked = checkLoginRateLimit('1.2.3.4', NOW + 1);
    expect(checked.allowed).toBe(false);
    expect(checked.remaining).toBe(0);
  });

  test('a locked address is refused before any verification could run', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) recordLoginFailure('1.2.3.4', NOW);
    const status = checkLoginRateLimit('1.2.3.4', NOW + 60_000);
    expect(status.allowed).toBe(false);
    expect(status.retryAfterSec).toBeGreaterThan(0);
  });

  test('the lockout lifts when it expires', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) recordLoginFailure('1.2.3.4', NOW);
    expect(checkLoginRateLimit('1.2.3.4', NOW + RATE_LIMIT_LOCKOUT_MS).allowed).toBe(true);
    expect(checkLoginRateLimit('1.2.3.4', NOW + RATE_LIMIT_LOCKOUT_MS).remaining).toBe(RATE_LIMIT_MAX_ATTEMPTS);
  });

  test('failures spread beyond the window do not accumulate', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS - 1; attempt += 1) {
      recordLoginFailure('1.2.3.4', NOW + attempt * (RATE_LIMIT_WINDOW_MS + 1));
    }
    // Each failure started a fresh window, so the address is nowhere near locked.
    expect(checkLoginRateLimit('1.2.3.4', NOW + RATE_LIMIT_MAX_ATTEMPTS * (RATE_LIMIT_WINDOW_MS + 1)).allowed).toBe(true);
  });

  test('a successful login clears the budget', () => {
    for (let attempt = 1; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) recordLoginFailure('1.2.3.4', NOW);
    clearLoginRateLimit('1.2.3.4');
    expect(checkLoginRateLimit('1.2.3.4', NOW).remaining).toBe(RATE_LIMIT_MAX_ATTEMPTS);
  });

  test('budgets are per address', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) recordLoginFailure('1.2.3.4', NOW);
    expect(checkLoginRateLimit('1.2.3.4', NOW).allowed).toBe(false);
    expect(checkLoginRateLimit('5.6.7.8', NOW).allowed).toBe(true);
  });

  test('an unidentifiable caller draws from the small shared budget', () => {
    for (let attempt = 1; attempt < RATE_LIMIT_UNKNOWN_MAX_ATTEMPTS; attempt += 1) {
      expect(recordLoginFailure(UNKNOWN_CLIENT_KEY, NOW).allowed).toBe(true);
    }
    expect(recordLoginFailure(UNKNOWN_CLIENT_KEY, NOW).allowed).toBe(false);
  });
});
