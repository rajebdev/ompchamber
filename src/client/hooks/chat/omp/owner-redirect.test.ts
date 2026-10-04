/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The client half of the cross-process ownership guard.
 *
 * The property that matters: a `session_owned_elsewhere` response with an
 * `ownerPort` MOVES THE TAB to the owning instance, because both instances
 * share one database and one agent dir — the session is already open there, and
 * retrying locally is what makes omp fork it. Everything else keeps the plain
 * refusal.
 */

import { beforeEach, describe, expect, test } from 'bun:test';

import { redirectToOwningInstance } from '@/client/hooks/chat/omp/owner-redirect';

let assigned: string[];

beforeEach(() => {
  assigned = [];
  // happy-dom's location.assign is not writable; stand in a stub for the test.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://127.0.0.1:3001/?folderId=2',
        assign: (url: string) => assigned.push(url),
      },
    },
  });
});

describe('redirectToOwningInstance', () => {
  test('moves the tab to the owning instance, keeping the session id', () => {
    const moved = redirectToOwningInstance(
      { code: 'session_owned_elsewhere', ownerPort: 3195, sessionId: 'sess-9' },
      'fallback',
    );
    expect(moved).toBe(true);
    expect(assigned).toEqual(['http://127.0.0.1:3195/?folderId=2&sessionId=sess-9']);
  });

  test('uses the caller session id when the body omits one', () => {
    redirectToOwningInstance({ code: 'session_owned_elsewhere', ownerPort: 3195 }, 'sess-fallback');
    expect(assigned[0]).toContain('sessionId=sess-fallback');
  });

  test('a different error code is not a redirect', () => {
    expect(redirectToOwningInstance({ code: 'session_busy', ownerPort: 3195 }, 's')).toBe(false);
    expect(assigned).toEqual([]);
  });

  test('an owner the chamber cannot place is not a redirect', () => {
    expect(redirectToOwningInstance({ code: 'session_owned_elsewhere', ownerPort: null }, 's')).toBe(false);
    expect(assigned).toEqual([]);
  });
});
