/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The wrapper's goal mirror.
 *
 * `get_state` does not carry goal mode, so this mirror is the only thing the
 * agent-state route can report a reattaching client. It is fed by omp's own
 * `goal_updated`, which is authoritative — and the rule that matters is which
 * STATUSES count as live, because the answer decides whether the composer's
 * toggle reads as on.
 */

import { describe, expect, test } from 'bun:test';
import { ModeMirror } from '@/server/lib/omp/rpc/mode-mirror';

function frame(status: string, enabled = true) {
  return { type: 'goal_updated', goal: { id: 'g1', objective: 'x', status }, state: { enabled, goal: { id: 'g1', objective: 'x', status } } };
}

describe('ModeMirror', () => {
  test('active and budget-limited are live', () => {
    for (const status of ['active', 'budget-limited']) {
      const mirror = new ModeMirror();
      mirror.observe(frame(status));
      expect(mirror.goalEnabled).toBe(true);
      expect(mirror.goalStatus).toBe(status);
    }
  });

  test('paused, complete and dropped are not live', () => {
    for (const status of ['paused', 'complete', 'dropped']) {
      const mirror = new ModeMirror();
      mirror.observe(frame(status));
      expect(mirror.goalEnabled).toBe(false);
      // The status is still recorded: the card and the modal show what the goal
      // WAS, which a bare boolean could not.
      expect(mirror.goalStatus).toBe(status);
    }
  });

  test('enabled:false wins even for an active status', () => {
    const mirror = new ModeMirror();
    mirror.observe(frame('active', false));
    expect(mirror.goalEnabled).toBe(false);
  });

  test('reads the status from the top-level goal when no state is present', () => {
    const mirror = new ModeMirror();
    mirror.observe({ type: 'goal_updated', goal: { id: 'g1', objective: 'x', status: 'active' } });
    expect(mirror.goalEnabled).toBe(false); // no `state.enabled`, so not live
    expect(mirror.goalStatus).toBe('active');
  });

  test('a null goal clears the status', () => {
    const mirror = new ModeMirror();
    mirror.observe(frame('active'));
    mirror.observe({ type: 'goal_updated', goal: null });
    expect(mirror.goalEnabled).toBe(false);
    expect(mirror.goalStatus).toBeUndefined();
  });
});
