/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import { formatNewSessionTitle, isPendingSessionId, pendingSessionCreatedAt, pendingSessionTitle } from '@/shared/lib/omp/session/default-title';

describe('pendingSessionCreatedAt', () => {
  test('parses the epoch out of a pending session id', () => {
    expect(pendingSessionCreatedAt('new-1737000000000')).toBe(1737000000000);
  });

  test('is NaN for a real omp UUID', () => {
    expect(Number.isNaN(pendingSessionCreatedAt('01a08410-8135-772c-b1cc-9ceed604deec'))).toBe(true);
  });

  test('treats a bare prefix as epoch 0 because Number("") is 0', () => {
    expect(pendingSessionCreatedAt('new-')).toBe(0);
  });

  test('is NaN for a non-numeric suffix', () => {
    expect(Number.isNaN(pendingSessionCreatedAt('new-abc'))).toBe(true);
  });

  test('is NaN for null and undefined', () => {
    expect(Number.isNaN(pendingSessionCreatedAt(null))).toBe(true);
    expect(Number.isNaN(pendingSessionCreatedAt(undefined))).toBe(true);
  });
});

describe('pendingSessionTitle', () => {
  test('reflects the id epoch rather than the current clock', () => {
    const title = pendingSessionTitle('new-1737000000000');
    expect(title).toContain('New Session - ');
    expect(title).toBe(formatNewSessionTitle(new Date(1737000000000)));
  });

  test('falls back to now for a non-numeric id without throwing', () => {
    expect(pendingSessionTitle('new-not-a-number').startsWith('New Session')).toBe(true);
  });
});

describe('isPendingSessionId', () => {
  test('is true for a pending id and false for a settled one', () => {
    expect(isPendingSessionId('new-1737000000000')).toBe(true);
    expect(isPendingSessionId('ses_alpha')).toBe(false);
  });
});
