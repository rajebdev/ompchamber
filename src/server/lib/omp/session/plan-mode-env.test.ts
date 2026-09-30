/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Restoring modes on a cold spawn.
 *
 * `--mode rpc-ui` never restores `mode_change`, so a session reopened from the
 * sidebar would come back with both modes off while the composer's toggles —
 * which read the persisted selection — said they were on. The spawn environment
 * is the only channel available before the child's first command, and these are
 * the rules that decide what goes in it.
 */

import { describe, expect, test } from 'bun:test';
import { readPersistedModes } from '@/server/lib/omp/session/modes';
import { chamberModeEnv } from '@/server/lib/omp/extensions/locator';

const line = (customType: string, data: unknown) => JSON.stringify({ type: 'custom', customType, data });

describe('spawn-time mode restore', () => {
  test('a session left in plan mode spawns with plan in its environment', () => {
    const modes = readPersistedModes(line('chamber-plan-state', { enabled: true }));
    expect(chamberModeEnv(modes).CHAMBER_MODES).toBe('plan');
  });

  test('a session with a LIVE goal spawns with goal AND auto-continuation', () => {
    const modes = readPersistedModes(
      line('chamber-goal-state', {
        enabled: true,
        goal: { id: 'g1', objective: 'x', status: 'active', tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
      }),
    );
    const env = chamberModeEnv(modes);
    expect(env.CHAMBER_MODES).toBe('goal');
    // Without this the restored goal would run one turn and stop.
    expect(env.CHAMBER_GOAL_AUTO_CONTINUE).toBe('1');
  });

  test('a PAUSED goal restores the mode but NOT the continuation', () => {
    // Pause is an instruction. The toggle should read as on (the goal exists),
    // while the loop stays off — arming it here would override omp's own
    // cold-start pause and start spending tokens the moment the session is
    // opened. Resume is the operator's move, and it re-arms the loop.
    const modes = readPersistedModes(
      line('chamber-goal-state', {
        enabled: true,
        goal: { id: 'g1', objective: 'x', status: 'paused', tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 },
      }),
    );
    expect(modes.goal).toBe(true);
    expect(modes.goalLive).toBe(false);
    expect(chamberModeEnv(modes).CHAMBER_GOAL_AUTO_CONTINUE).toBeUndefined();
  });

  test('a finished goal does not restore anything', () => {
    const modes = readPersistedModes(
      line('chamber-goal-state', {
        enabled: false,
        goal: { id: 'g1', objective: 'x', status: 'complete', tokensUsed: 1, timeUsedSeconds: 1, createdAt: 0, updatedAt: 0 },
      }),
    );
    expect(chamberModeEnv(modes).CHAMBER_MODES).toBe('');
  });
});
