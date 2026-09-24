/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The staleness rule behind the sidebar's self-heal. Getting it wrong is
 * user-visible in both directions: too eager clears the spinner of a run that
 * is still working, too lazy leaves a spinner turning forever for a run whose
 * process is gone.
 *
 * The rule is deliberately a pure function of the ROW plus OS liveness, with no
 * caller context. That is what makes several chamber instances agree: they all
 * read the same row and ask the same question about the same pid.
 */

import { describe, expect, test } from 'bun:test';

import { isStaleStreamRow } from '@/shared/lib/omp/session/stream-state.server';

const OWNER = 4242;
const otherInstance = 9999;
/** OWNER and the other instance are alive; anything else, including 999999, is not. */
const alive = (pid: number) => pid === OWNER || pid === otherInstance;

describe('isStaleStreamRow', () => {
  test('a row whose owner is alive is live, whoever is asking', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: OWNER }, alive)).toBe(false);
  });

  test('a row whose owner is gone is stale', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: 999999 }, alive)).toBe(true);
  });

  test('the verdict does not depend on which instance is asking', () => {
    // The regression this shape exists for: several instances read ONE row and
    // must report the same status. Judging by the reader's own runtime registry
    // made a second instance call another instance's live run stale — the row
    // is live here, and every asker must say so.
    const row = { session_id: 's1', owner_pid: otherInstance };
    const verdicts = [otherInstance, OWNER, 12345].map(() => isStaleStreamRow(row, alive));
    expect(verdicts).toEqual([false, false, false]);
  });

  test('an ownerless row is stale, because nothing can vouch for its run', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: null }, alive)).toBe(true);
  });

  test('a row owned by the reader is judged by liveness like any other', () => {
    // Self-ownership is not special-cased: the reader's own pid is alive while
    // it runs, so its live rows survive.
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: OWNER }, (pid) => pid === OWNER)).toBe(false);
  });
});
